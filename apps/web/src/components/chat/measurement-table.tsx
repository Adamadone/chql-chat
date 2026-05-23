"use client";

import { useMemo, useRef, useState } from "react";
import { useAction } from "convex/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Wire type (mirrors @chql-chat/chql-core SearchEnvelope) ────────────────
// We don't import from chql-core to keep node:crypto out of the browser bundle.
// The shape is enforced server-side by the MCP envelope builder; we runtime-
// validate at the top of the component before rendering.

interface EnvelopeShape {
  rowCount: number;
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

/** Render any cell value as a short string. Arrays (e.g. alarms) become comma lists. */
function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    // Use a sensible number format: keep small numbers exact, prevent
    // tiny floating-point noise for large values.
    return Number.isInteger(value) ? value.toString() : value.toString();
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.map(formatCell).join(", ");
  return JSON.stringify(value);
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Approximate row height in px. The virtualizer measures real heights too. */
const ESTIMATED_ROW_HEIGHT = 32;

/** Cap visible body height so the table doesn't dominate the chat scroll. */
const MAX_BODY_HEIGHT_PX = 400;

// ─── Component ──────────────────────────────────────────────────────────────

export function MeasurementTable({
  chatId,
  messageId,
  envelope,
}: MeasurementTableProps) {
  const fetchPage = useAction(api.ai.fetchPage);
  const [isFetching, setIsFetching] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Stable columns: derive from the envelope's `columns` field directly.
  // If `columns` is missing/empty (defensive), fall back to deriving from
  // the first row's keys.
  const columns = useMemo<string[]>(() => {
    if (!isEnvelope(envelope)) return [];
    if (envelope.columns.length > 0) return envelope.columns;
    const first = envelope.rows[0];
    return first ? Object.keys(first) : [];
  }, [envelope]);

  const rows = useMemo<Array<Record<string, unknown>>>(() => {
    return isEnvelope(envelope) ? envelope.rows : [];
  }, [envelope]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
  });

  // Skip rendering entirely when there's nothing to show:
  //   - envelope is missing or malformed (e.g. legacy raw aqdef-json)
  //   - rowCount is 0 (analytical query with no matches; LLM caption covers it)
  if (!isEnvelope(envelope)) return null;
  if (envelope.rowCount === 0 || rows.length === 0) return null;

  const { pageNumber, pageSize } = envelope.page;
  // Show pagination only when there's clearly more data to fetch. We don't
  // know totalPages from the envelope (chy.stat doesn't surface a total
  // count), so we infer: if this page is "full" we assume more exists.
  const hasNext = rows.length >= pageSize;
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

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background/60">
      {/* Header row: column names + count summary */}
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
        <div className="text-xs text-muted-foreground">
          Showing {rows.length} {rows.length === 1 ? "row" : "rows"} · page {pageNumber}
        </div>
      </div>

      {/* Virtualized scroll region */}
      <div
        ref={scrollRef}
        className="overflow-auto"
        style={{ maxHeight: MAX_BODY_HEIGHT_PX }}
      >
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="border-b border-border px-2 py-1.5 text-left font-medium text-foreground"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            style={{
              // Reserve the full virtual height so the scrollbar is correct,
              // then absolutely-position each rendered row at its offset.
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
              display: "block",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <tr
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={(el) => virtualizer.measureElement(el)}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                    display: "table",
                    tableLayout: "fixed",
                  }}
                  className={cn(
                    "border-b border-border/60",
                    virtualRow.index % 2 === 1 && "bg-muted/20",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col}
                      className="truncate px-2 py-1 align-top text-foreground/90"
                      title={formatCell(row[col])}
                    >
                      {formatCell(row[col])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-1.5 text-xs">
        <div className="text-muted-foreground">
          {pageError ? (
            <span className="text-destructive">{pageError}</span>
          ) : (
            <span>Page size: {pageSize}</span>
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
            {isFetching ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ChevronLeft className="size-3" />
            )}
          </Button>
          <span className="px-1 text-muted-foreground">{pageNumber}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            disabled={!hasNext || isFetching}
            onClick={() => goToPage(pageNumber + 1)}
            aria-label="Next page"
          >
            {isFetching ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
