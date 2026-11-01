// Ranker — contract in src/md/domain/ranker.md.
// Pure: imports only ports. Derives term weights and source interest from the
// event ledger at read time; no weight table, survives a fresh database.
import type { Clock, LedgerEvent, Source, Story } from "./ports";

export type { Clock, LedgerEvent, Source, Story, Store } from "./ports";

const COLD_START_THRESHOLD = 10;
const HALF_LIFE_DAYS = 14;
const TERM_CLAMP = 2;
const MAX_RECEIPT_FRAGMENTS = 3;

// Sentiment per event kind: positive pushes terms up, negative down, 0 = no signal.
export function sentiment(e: LedgerEvent): number {
  switch (e.kind) {
    case "keep":
      return 1;
    case "skip":
      return -1;
    case "rate": {
      const v = Number(e.target);
      return Number.isFinite(v) ? Math.max(-2, Math.min(2, v)) : 0;
    }
    case "read": {
      const ms = Number(e.target);
      return Number.isFinite(ms) && ms > 30_000 ? 1 : 0;
    }
    case "capture":
      return 0;
  }
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((t) => t.length > 2);
}

function decayHalfLife(sentiment: number, ageMs: number): number {
  const halfLives = ageMs / (HALF_LIFE_DAYS * 24 * 3600_000);
  return sentiment / Math.pow(2, halfLives);
}

/** Normalized to [-2, +2], recency-decayed. */
export function termWeights(events: LedgerEvent[], nowMs: number): Map<string, number> {
  const raw = new Map<string, number>();
  for (const e of events) {
    const s = sentiment(e);
    if (s === 0) continue;
    for (const term of tokenize(e.target)) {
      raw.set(term, (raw.get(term) ?? 0) + decayHalfLife(s, nowMs - e.ts));
    }
  }
  // Normalize so the strongest term maps to ±2.
  let max = 0;
  for (const v of raw.values()) max = Math.max(max, Math.abs(v));
  const scale = max > 0 ? TERM_CLAMP / max : 0;
  const out = new Map<string, number>();
  for (const [term, v] of raw) out.set(term, v * scale);
  return out;
}

/** sources.kept - sources.skipped, normalized to [-2, +2]. */
export function interestBySource(sources: Source[]): Map<string, number> {
  let max = 0;
  const deltas = sources.map((s) => ({ url: s.url, d: s.kept - s.skipped }));
  for (const { d } of deltas) max = Math.max(max, Math.abs(d));
  const scale = max > 0 ? TERM_CLAMP / max : 0;
  return new Map(deltas.map(({ url, d }) => [url, d * scale]));
}

export function sentimentEventCount(events: LedgerEvent[]): number {
  return events.filter((e) => sentiment(e) !== 0).length;
}

export function coldStart(events: LedgerEvent[]): boolean {
  return sentimentEventCount(events) < COLD_START_THRESHOLD;
}

/** Sum of the story's term weights, clamped to [-2, +2]. */
export function termScore(story: Story, weights: Map<string, number>): number {
  const tokens = tokenize(`${story.title} ${story.text ?? ""}`);
  let sum = 0;
  for (const t of tokens) sum += weights.get(t) ?? 0;
  return Math.max(-TERM_CLAMP, Math.min(TERM_CLAMP, sum));
}

export function score(
  story: Story,
  events: LedgerEvent[],
  sources: Source[],
  nowMs: number,
): number {
  return (
    termScore(story, termWeights(events, nowMs)) +
    (interestBySource(sources).get(story.source ?? "") ?? 0)
  );
}

/**
 * One-line receipt: `<term> +1.5 (2 kept)` fragments, ", "-joined, max 3.
 * No signal history → "no signal yet".
 */
export function whyReceipt(story: Story, events: LedgerEvent[], nowMs: number): string {
  // Fragments come from the ledger events backing the story's terms.
  const perTerm = new Map<string, { weight: number; kept: number; skipped: number }>();
  for (const e of events) {
    const s = sentiment(e);
    if (s === 0) continue;
    for (const term of tokenize(e.target)) {
      const cur = perTerm.get(term) ?? { weight: 0, kept: 0, skipped: 0 };
      cur.weight += decayHalfLife(s, nowMs - e.ts);
      if (s > 0) cur.kept += 1;
      else cur.skipped += 1;
      perTerm.set(term, cur);
    }
  }
  const storyTerms = new Set(tokenize(`${story.title} ${story.text ?? ""}`));
  let max = 0;
  const mine = [...perTerm].filter(([t]) => storyTerms.has(t));
  for (const [, v] of mine) max = Math.max(max, Math.abs(v.weight));
  const scale = max > 0 ? TERM_CLAMP / max : 0;
  const fragments = mine
    .map(([term, v]) => ({
      term,
      weight: v.weight * scale,
      count: v.kept + v.skipped,
      kind: v.kept >= v.skipped ? "kept" : "skipped",
    }))
    .filter((f) => Math.abs(f.weight) >= 0.05)
    .sort((a, b) => {
      const d = Math.abs(b.weight) - Math.abs(a.weight);
      if (d !== 0) return d;
      if (a.weight > 0 !== b.weight > 0) return a.weight > 0 ? -1 : 1;
      return a.term.localeCompare(b.term);
    })
    .slice(0, MAX_RECEIPT_FRAGMENTS);
  if (fragments.length === 0) return "no signal yet";
  return fragments
    .map((f) => {
      const w = f.weight >= 0 ? `+${f.weight.toFixed(1)}` : f.weight.toFixed(1);
      return `${f.term} ${w} (${f.count} ${f.kind})`;
    })
    .join(", ");
}

export type RankedStory = { story: Story; score: number; receipt: string };

/**
 * Rank the queue. Cold start (fewer than 10 sentiment events) → chronological
 * newest first, receipts read "no signal yet". Otherwise score = term + interest,
 * ties break on added_at DESC.
 */
export function rankQueue(
  stories: Story[],
  events: LedgerEvent[],
  sources: Source[],
  clock: Clock,
): RankedStory[] {
  const nowMs = clock.now();
  if (coldStart(events)) {
    return [...stories]
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((story) => ({ story, score: 0, receipt: "no signal yet" }));
  }
  const weights = termWeights(events, nowMs);
  const interest = interestBySource(sources);
  return stories
    .map((story) => {
      const s = termScore(story, weights) + (interest.get(story.source ?? "") ?? 0);
      return { story, score: s, receipt: whyReceipt(story, events, nowMs) };
    })
    .sort((a, b) => b.score - a.score || b.story.addedAt - a.story.addedAt);
}

/** Remaining sentiment events until the ranking goes live, e.g. "5 ratings until ranking". */
export function coldStartNotice(events: LedgerEvent[]): string | null {
  if (!coldStart(events)) return null;
  const left = COLD_START_THRESHOLD - sentimentEventCount(events);
  return `${left} ratings until ranking`;
}
