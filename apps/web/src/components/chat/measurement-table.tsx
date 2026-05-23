"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAction } from "convex/react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
} from "lucide-react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ─── Wire type (mirrors @chql-chat/chql-core SearchEnvelope) ────────────────
// We don't import from chql-core to keep node:crypto out of the browser
// bundle. The shape is enforced server-side by the MCP envelope builder; we
// runtime-validate the minimum fields at the top of the component.

interface EnvelopeShape {
  rowCount: number;
  measurementCount?: number;
  page: { pageNumber: number; pageSize: number };
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

interface MeasurementTableProps {
  chatId: Id<"chats">;
  messageId: Id<"messages">;
  /** Persisted `metadata.apiResponse` — typed `unknown` because Convex stores it as v.any(). */
  envelope: unknown;
}

// ─── Validation & cell formatting ───────────────────────────────────────────

function isEnvelope(x: unknown): x is EnvelopeShape {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.rowCount === "number" &&
    Array.isArray(e.rows) &&
    Array.isArray(e.columns) &&
    typeof e.page === "object" &&
    e.page !== null &&
    typeof (e.page as Record<string, unknown>).pageNumber === "number"
  );
}

/**
 * Cheap parent-side check: should the table component be rendered at all?
 * Lets the message bubble skip mounting the component when there's nothing
 * to show (no envelope, malformed envelope, or empty result set).
 */
export function shouldRenderMeasurementTable(envelope: unknown): boolean {
  return isEnvelope(envelope) && envelope.rowCount > 0;
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.map(formatScalar).join(", ");
  return JSON.stringify(value);
}

/** Trim ISO timestamps (`2026-05-23T14:59:11+02:00`) to `2026-05-23 14:59:11`. */
function formatTimestamp(value: unknown): string {
  if (typeof value !== "string") return formatScalar(value);
  // Match "YYYY-MM-DDTHH:MM:SS" prefix and rewrite the T as a space.
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  return m ? `${m[1]} ${m[2]}` : value;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MIN_COL_WIDTH_PX = 96;

/** Cap the visible height of any single part-table so the bubble stays scrollable. */
const MAX_PART_BODY_HEIGHT_PX = 360;

// ─── Pivot logic ────────────────────────────────────────────────────────────
//
// The flat envelope rows are one-per-value (K0001) with all parent K-keys
// merged in. We re-derive the (part, characteristic, K0000) groupings here
// to render the table the way the user thinks about the data: rows are
// measurement events, columns are characteristics.

type Row = Record<string, unknown>;

interface CharacteristicCol {
  /** Stable identity for React keys + de-dup. */
  charKey: string;
  /** Header label: K2002 if present, else the raw key. */
  label: string;
  /** Unit suffix (K2142) rendered in parentheses after the label. */
  unit?: string;
}

interface PivotCell {
  /** The measured value (K0001) for this (event, characteristic). */
  value: unknown;
  /** Per-value K-keys for the tooltip. */
  K0002?: unknown;
  K0007?: unknown;
  K0010?: unknown;
  K0014?: unknown;
  alarms?: unknown;
  hasAlarms: boolean;
}

interface PivotEvent {
  /** The measurement event identity (K0000 stringified). */
  eventKey: string;
  /** Timestamp (K0004) — first non-null across the event's source rows. */
  timestamp?: unknown;
  /** Cells keyed by `charKey`. */
  cells: Map<string, PivotCell>;
}

interface PivotedPart {
  partKey: string;
  /** K1001/K1002/K1003/K1008 from the part's first row, for the caption. */
  caption: {
    K1000?: unknown;
    K1001?: unknown;
    K1002?: unknown;
    K1003?: unknown;
    K1008?: unknown;
  };
  characteristics: CharacteristicCol[];
  events: PivotEvent[];
  /** Source rows for this part that had no K0000 — surfaced as a footnote. */
  ungroupedValueCount: number;
}

function partKeyOf(row: Row): string {
  const k1000 = row.K1000;
  if (k1000 !== undefined && k1000 !== null) return `1000:${String(k1000)}`;
  const k1001 = row.K1001;
  if (k1001 !== undefined && k1001 !== null) return `1001:${String(k1001)}`;
  return "_unknown";
}

function charKeyOf(row: Row): string {
  const k2000 = row.K2000;
  if (k2000 !== undefined && k2000 !== null) return `2000:${String(k2000)}`;
  const k2001 = row.K2001;
  if (k2001 !== undefined && k2001 !== null) return `2001:${String(k2001)}`;
  return "_unknown";
}

function pivot(rows: Row[]): PivotedPart[] {
  const parts = new Map<string, PivotedPart>();
  // Track characteristic insertion order per part so columns stay stable.
  const partCharIdx = new Map<string, Map<string, number>>();
  // Track event insertion order per part so rows stay in source order.
  const partEventIdx = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const pKey = partKeyOf(row);
    let part = parts.get(pKey);
    if (!part) {
      part = {
        partKey: pKey,
        caption: {
          K1000: row.K1000,
          K1001: row.K1001,
          K1002: row.K1002,
          K1003: row.K1003,
          K1008: row.K1008,
        },
        characteristics: [],
        events: [],
        ungroupedValueCount: 0,
      };
      parts.set(pKey, part);
      partCharIdx.set(pKey, new Map());
      partEventIdx.set(pKey, new Map());
    }

    // Track this characteristic for this part.
    const cKey = charKeyOf(row);
    const charIdx = partCharIdx.get(pKey)!;
    if (!charIdx.has(cKey)) {
      charIdx.set(cKey, part.characteristics.length);
      const k2002 = typeof row.K2002 === "string" ? row.K2002 : undefined;
      const k2142 = typeof row.K2142 === "string" ? row.K2142 : undefined;
      const k2001 = typeof row.K2001 === "string" ? row.K2001 : undefined;
      part.characteristics.push({
        charKey: cKey,
        label: k2002 ?? (k2001 ? `K2001=${k2001}` : cKey),
        unit: k2142,
      });
    }

    // K0000 groups values into one measurement event. Without it we can't
    // pivot reliably; surface those rows as an "ungrouped" footnote count.
    const k0000 = row.K0000;
    if (k0000 === undefined || k0000 === null) {
      part.ungroupedValueCount += 1;
      continue;
    }
    const eventKey = String(k0000);
    const eventIdx = partEventIdx.get(pKey)!;
    let evtPos = eventIdx.get(eventKey);
    if (evtPos === undefined) {
      evtPos = part.events.length;
      eventIdx.set(eventKey, evtPos);
      part.events.push({ eventKey, timestamp: row.K0004, cells: new Map() });
    }
    const evt = part.events[evtPos];
    if (evt.timestamp === undefined || evt.timestamp === null) {
      evt.timestamp = row.K0004;
    }

    const alarms = row.alarms;
    const hasAlarms = Array.isArray(alarms) && alarms.length > 0;
    evt.cells.set(cKey, {
      value: row.K0001,
      K0002: row.K0002,
      K0007: row.K0007,
      K0010: row.K0010,
      K0014: row.K0014,
      alarms,
      hasAlarms,
    });
  }

  return Array.from(parts.values());
}

// ─── Component ──────────────────────────────────────────────────────────────

/** Build a short, readable label for a part — used in the dropdown trigger + items. */
function partLabel(part: PivotedPart): { description: string; number?: string } {
  const description =
    typeof part.caption.K1002 === "string" && part.caption.K1002.length > 0
      ? part.caption.K1002
      : "(no description)";
  const number =
    part.caption.K1001 !== undefined && part.caption.K1001 !== null
      ? String(part.caption.K1001)
      : undefined;
  return { description, number };
}

export function MeasurementTable({
  chatId,
  messageId,
  envelope,
}: MeasurementTableProps) {
  const fetchPage = useAction(api.ai.fetchPage);
  const [isFetching, setIsFetching] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [selectedPartKey, setSelectedPartKey] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);
  const infoContentRef = useRef<HTMLDivElement | null>(null);

  // Close the click-controlled info tooltip on outside click or Escape.
  useEffect(() => {
    if (!infoOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (infoButtonRef.current?.contains(target)) return;
      if (infoContentRef.current?.contains(target)) return;
      setInfoOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfoOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [infoOpen]);

  const parts = useMemo<PivotedPart[]>(() => {
    if (!isEnvelope(envelope)) return [];
    return pivot(envelope.rows);
  }, [envelope]);

  // Resolve which part to render. Preserves the user's selection across
  // pagination when the same partKey still appears on the new page; falls
  // back to the first part otherwise.
  const activePart = useMemo<PivotedPart | null>(() => {
    if (parts.length === 0) return null;
    if (selectedPartKey) {
      const found = parts.find((p) => p.partKey === selectedPartKey);
      if (found) return found;
    }
    return parts[0];
  }, [parts, selectedPartKey]);

  if (!isEnvelope(envelope)) return null;
  if (envelope.rowCount === 0 || parts.length === 0 || !activePart) return null;

  const { pageNumber, pageSize } = envelope.page;
  // We don't know the total; assume more if the page came back full.
  const hasNext = envelope.rows.length >= pageSize;
  const hasPrev = pageNumber > 1;

  async function goToPage(next: number) {
    if (next < 1 || isFetching) return;
    setIsFetching(true);
    setPageError(null);
    try {
      const result = await fetchPage({ chatId, messageId, pageNumber: next });
      if (!result.success) {
        setPageError(result.error ?? "Failed to fetch page");
      }
    } catch (err) {
      setPageError(err instanceof Error ? err.message : "Failed to fetch page");
    } finally {
      setIsFetching(false);
    }
  }

  const activeLabel = partLabel(activePart);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background/60">
        {parts.length > 1 && (
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-left text-sm hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="shrink-0 font-medium text-muted-foreground">
                    Part
                  </span>
                  <span className="truncate font-semibold text-foreground">
                    {activeLabel.description}
                  </span>
                  {activeLabel.number ? (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      #{activeLabel.number}
                    </span>
                  ) : null}
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 overflow-auto">
                <DropdownMenuRadioGroup
                  value={activePart.partKey}
                  onValueChange={setSelectedPartKey}
                >
                  {parts.map((p) => {
                    const label = partLabel(p);
                    return (
                      <DropdownMenuRadioItem
                        key={p.partKey}
                        value={p.partKey}
                        className="gap-2"
                      >
                        <span className="truncate font-medium">
                          {label.description}
                        </span>
                        {label.number ? (
                          <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                            #{label.number}
                          </span>
                        ) : null}
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {p.events.length}{" "}
                          {p.events.length === 1 ? "meas." : "meas."}
                        </span>
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="shrink-0 text-[11px] text-muted-foreground">
              {parts.length} parts on this page
            </div>
          </div>
        )}

        <PartTable part={activePart} showHeader={parts.length === 1} />

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-1.5 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {pageError ? (
              <span className="text-destructive">{pageError}</span>
            ) : (
              <Tooltip open={infoOpen} onOpenChange={() => {}}>
                <TooltipTrigger asChild>
                  <button
                    ref={infoButtonRef}
                    type="button"
                    className="inline-flex items-center text-muted-foreground/70 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-label="About pagination"
                    aria-expanded={infoOpen}
                    onClick={(e) => {
                      e.preventDefault();
                      setInfoOpen((v) => !v);
                    }}
                  >
                    <Info className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div
                    ref={infoContentRef}
                    className="space-y-1.5 text-[11px] leading-snug"
                  >
                    <p>
                      Each page contains up to {pageSize} source data points
                      from chy.stat.
                    </p>
                    <p>
                      Rows in the table are grouped by measurement event, so
                      each row bundles several data points (one per
                      characteristic). The row count varies by page because
                      events have different numbers of data points.
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              disabled={!hasPrev || isFetching}
              onClick={() => goToPage(pageNumber - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3" />
            </Button>
            <span
              className="flex min-w-6 items-center justify-center px-1 tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {isFetching ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                pageNumber
              )}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              disabled={!hasNext || isFetching}
              onClick={() => goToPage(pageNumber + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ─── Per-part subcomponent ──────────────────────────────────────────────────

function PartTable({
  part,
  showHeader,
}: {
  part: PivotedPart;
  /** When false, omit the per-part caption (the dropdown carries it instead). */
  showHeader: boolean;
}) {
  const partDescription =
    typeof part.caption.K1002 === "string" && part.caption.K1002.length > 0
      ? part.caption.K1002
      : undefined;
  const partNumber =
    part.caption.K1001 !== undefined && part.caption.K1001 !== null
      ? String(part.caption.K1001)
      : undefined;

  // One timestamp column + one per characteristic.
  const totalColumns = 1 + part.characteristics.length;
  const gridCols = `minmax(140px, 1.4fr) repeat(${part.characteristics.length}, minmax(${MIN_COL_WIDTH_PX}px, 1fr))`;
  const tableMinWidth = totalColumns * MIN_COL_WIDTH_PX;

  return (
    <section className="bg-background/30">
      {showHeader && (
        <header className="flex items-center justify-between gap-3 border-l-2 border-primary/40 bg-muted/30 px-3 py-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 text-sm font-medium text-muted-foreground">
              Part
            </span>
            {partDescription ? (
              <span className="truncate text-sm font-semibold text-foreground">
                {partDescription}
              </span>
            ) : (
              <span className="truncate text-sm italic text-muted-foreground">
                no description
              </span>
            )}
            {partNumber ? (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                #{partNumber}
              </span>
            ) : null}
          </div>
          <div className="shrink-0 text-[11px] text-muted-foreground">
            {part.events.length}{" "}
            {part.events.length === 1 ? "measurement" : "measurements"}
            {part.ungroupedValueCount > 0
              ? ` · ${part.ungroupedValueCount} ungrouped values`
              : ""}
          </div>
        </header>
      )}

      <div
        className="overflow-auto"
        style={{ maxHeight: MAX_PART_BODY_HEIGHT_PX }}
      >
        <div style={{ width: tableMinWidth, minWidth: "100%" }}>
          {/* Header row */}
          <div
            className="sticky top-0 z-10 grid border-y border-border bg-muted/80 text-[11px] font-medium text-foreground backdrop-blur"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="truncate px-2 py-1.5 text-left">timestamp</div>
            {part.characteristics.map((char) => (
              <div
                key={char.charKey}
                className="truncate px-2 py-1.5 text-left"
                title={
                  char.unit ? `${char.label} (${char.unit})` : char.label
                }
              >
                {char.label}
                {char.unit ? (
                  <span className="ml-1 text-muted-foreground">
                    ({char.unit})
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {/* Body rows — one per measurement event */}
          {part.events.map((evt, evtIdx) => (
            <div
              key={evt.eventKey}
              className={cn(
                "grid border-b border-border/60 text-[11px]",
                evtIdx % 2 === 1 && "bg-muted/20",
              )}
              style={{ gridTemplateColumns: gridCols }}
            >
              <div
                className="truncate px-2 py-1 text-foreground/90"
                title={formatScalar(evt.timestamp)}
              >
                {formatTimestamp(evt.timestamp)}
              </div>
              {part.characteristics.map((char) => {
                const cell = evt.cells.get(char.charKey);
                if (!cell) {
                  return (
                    <div
                      key={char.charKey}
                      className="px-2 py-1 text-muted-foreground/40"
                      aria-label="no value"
                    >
                      —
                    </div>
                  );
                }
                const tooltip = [
                  cell.K0002 !== undefined && `K0002=${formatScalar(cell.K0002)}`,
                  cell.K0007 !== undefined && `K0007=${formatScalar(cell.K0007)}`,
                  cell.K0010 !== undefined && `K0010=${formatScalar(cell.K0010)}`,
                  cell.K0014 !== undefined && `K0014=${formatScalar(cell.K0014)}`,
                  cell.hasAlarms && `alarms=${formatScalar(cell.alarms)}`,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div
                    key={char.charKey}
                    className="flex items-center gap-1.5 truncate px-2 py-1 text-foreground/90"
                    title={tooltip || formatScalar(cell.value)}
                  >
                    {cell.hasAlarms && (
                      <span
                        className="inline-block size-1.5 shrink-0 rounded-full bg-amber-500"
                        aria-label="has alarms"
                      />
                    )}
                    <span className="truncate">{formatScalar(cell.value)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
