// Tests for the prompt-composer router. Uses Node's built-in `node:test`
// runner so no additional devDep is needed. Compile to dist with `tsc`, then
// run `node --test dist/router.test.js` (see scripts in package.json).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { routeSections } from "./router.js";
import type { SectionId } from "./reference.js";
import { extractKkeys } from "./kkeys.js";
import type { GoldenQuestion } from "./grading.js";

// ─── Per-category unit cases ────────────────────────────────────────────────
//
// These pin down the trigger contract by hand. The golden-set snapshot below
// is the safety net; these are the human-readable spec of "what does the
// router do on familiar inputs".

test("piece-id question routes to value only", () => {
  const out = routeSections(["Find all measurements for piece with ID 10113943"]);
  assert.deepEqual(out, ["value"]);
});

test("part-code question routes to part", () => {
  const out = routeSections(["Show all measurements for part code 3"]);
  assert.ok(out.includes("part"));
});

test("characteristic-code question routes to char", () => {
  const out = routeSections(["Find filling_value measurements above 0.5"]);
  assert.ok(out.includes("char"));
});

test("operation question routes to ops without char", () => {
  const out = routeSections(["Show measurements from operation OP30"]);
  assert.ok(out.includes("ops"));
  // Important: ops must be self-contained (K2311 lives in ops, not char).
  // Routing 'char' here is allowed but not required.
});

test("alarm question routes to alarms", () => {
  const out = routeSections(["Find all measurements without any alarms"]);
  assert.ok(out.includes("alarms"));
});

test("explicit alarm name routes to alarms", () => {
  const out = routeSections([
    "Give me air_pressure measurements that triggered an aboveSpecification alarm",
  ]);
  assert.ok(out.includes("alarms"));
  assert.ok(out.includes("char"));
});

test("date question routes to value", () => {
  const out = routeSections(["Show measurements taken on 2026-05-11"]);
  assert.ok(out.includes("value"));
});

test("time vocabulary routes to value (last hour)", () => {
  const out = routeSections(["Find measurements from the last hour"]);
  assert.ok(out.includes("value"));
});

test("conjunction question routes to all needed sections", () => {
  const out = routeSections([
    "Show me filling_value measurements from operation OP30",
  ]);
  assert.ok(out.includes("char"), `expected 'char' in ${JSON.stringify(out)}`);
  assert.ok(out.includes("ops"), `expected 'ops' in ${JSON.stringify(out)}`);
});

test("multi-turn history is concatenated", () => {
  // First message triggers ALARMS, second message triggers PART; both stay in.
  const out = routeSections([
    "show me any alarms today",
    "and only IPA CHYSTAT please",
  ]);
  assert.ok(out.includes("alarms"));
  assert.ok(out.includes("part"));
});

test("greeting routes to no conditional sections", () => {
  const out = routeSections(["hello!"]);
  assert.deepEqual(out, []);
});

test("returned sections are in canonical order", () => {
  const out = routeSections([
    "find alarms on IPA part for filling_value at operation OP30 today",
  ]);
  const canonical: SectionId[] = ["part", "char", "value", "ops", "alarms", "antlr"];
  const filtered = canonical.filter((id) => out.includes(id));
  assert.deepEqual(out, filtered);
});

// ─── Golden-set snapshot: K-key coverage ────────────────────────────────────
//
// Safety net against the regex map drifting away from the real evaluation
// surface. For every equivalence-graded golden question, we extract the set
// of K-keys used in `expectedChql` and assert that the router's chosen
// sections (plus CORE, which carries no K-keys) own every one of them.
//
// Under-coverage on this test means a question whose expected query uses a
// K-key the model would not see in the composed prompt — i.e. a guaranteed
// accuracy regression on the composed path. Over-coverage is fine.

/** K-key → owning section (the section that documents this K-key). */
function sectionOfKkey(kkey: string): SectionId | null {
  if (/^K00\d{2}$/.test(kkey)) return "value";
  if (/^K10\d{2}$/.test(kkey)) return "part";
  if (kkey === "K2311") return "ops";
  if (/^K2[012]\d{2}$/.test(kkey)) return "char";
  return null; // Unknown / unscoped — skip (no section owns it).
}

const goldenSetPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "eval",
  "golden-set.json",
);
const goldenSet: GoldenQuestion[] = JSON.parse(
  readFileSync(goldenSetPath, "utf-8"),
);

for (const q of goldenSet) {
  // Only equivalence questions have an expectedChql to derive K-keys from.
  if (q.expectedBehavior !== "equivalence") continue;
  if (!q.expectedChql) continue;
  // The `ambiguous` and `errors` categories test the model's recovery from
  // vague phrasing and from typos against the vocabulary list. A pure-regex
  // router has no way to map "fillinng_value" → "filling_value" — that would
  // require fuzzy matching or a tiny LLM first-pass router, both of which we
  // explicitly chose against. These are documented limitations of the
  // composer rather than router bugs.
  if (q.category === "ambiguous") continue;
  if (q.category === "errors") continue;

  test(`golden ${q.id}: routed sections cover all expected K-keys`, () => {
    const expectedKkeys = extractKkeys(q.expectedChql!);
    const requiredSections = new Set<SectionId>();
    for (const k of expectedKkeys) {
      const s = sectionOfKkey(k);
      if (s) requiredSections.add(s);
    }
    // If the expected query uses a named alarm, the model needs ALARMS too.
    if (/HAS\s+ALARM\s+'/i.test(q.expectedChql!)) {
      requiredSections.add("alarms");
    }

    const routed = new Set(routeSections([q.query]));
    const missing = [...requiredSections].filter((s) => !routed.has(s));
    assert.deepEqual(
      missing,
      [],
      `question "${q.query}" needs ${[...requiredSections].join(",")} but router returned ${[...routed].join(",") || "[]"}`,
    );
  });
}
