# Ranker

The ranker turns the event ledger into a queue order and a one-line
why-receipt per story. It imports only ports (`Store`, `Clock`) — no SQL, no
IO of its own.

## Inputs

Events from the ledger (`src/md/data/store.md`):

- `rate` — explicit rating; `target` holds a numeric value (+2 to -2).
  The event's terms come from the rated story (`storyId` → title + text), so a
  rating is signal about that story's words, same as keep/skip.
- `keep` — story kept for reading. Target: story id.
- `skip` — story dismissed. Target: story id.
- `read` — time spent; `target` holds read_ms.
- `capture` — URL or feed subscribed. Target: the URL.

## Weights

Two signals, both derived at read time from `events`:

1. **Term weights** — tokens from titles/text of events with positive
   sentiment (kept, read>30s, rated >0) push their terms up; negative
   sentiment (skipped, rated <0) pushes down. Term weight =
   `Σ(sentiment)` per term, normalized to [-2, +2], decayed by recency
   (half-life 14 days against `Clock.now()`). Rate events tokenize the rated
   story's title + text (resolved via `storyId`), not the numeric target.
2. **Interest per source** — `sources.kept - sources.skipped`, normalized to
   [-2, +2]. A feed you keep from outranks a feed you skip from.

## Story score

`score(story) = termScore(story.title + story.text) + interest(story.source)`

`termScore` sums the story's term weights, clamped to [-2, +2] so a long
article can't dominate. Unseen terms contribute 0. Ties break on
`added_at DESC`.

## Semantics

- **rating** — writing a number over a story appends `rate` and moves it in
  the queue immediately (score recomputed, not re-ranked later).
- **keep** — appends `keep`, increments `sources.kept` if the story has a
  source, story stays at the top of the queue.
- **skip** — appends `skip`, sets `dismissed = 1`, increments
  `sources.skipped`. Skipped stories leave the queue.
- **mark** (`m`) — appends `read` with the elapsed read_ms, sets
  `story.read_ms`.

## whyReceipt(story): string

One line, human words plus the weights behind them. Format:

```
<term> <weight> (<count> <kind>s)` — joined by ", ", max 3 fragments.
```

Examples:

```
terminal +1.5 (2 kept)
rust +0.8 (3 kept), crypto -1.2 (2 skipped)
```

Rules:

- Weights shown to one decimal, sign always visible.
- `(n kept)` / `(n skipped)` / `(n rated)` counts come from the ledger events
  backing the weight, not from the normalized score. Kind is `rated` when rate
  events dominate the fragment, else `kept`/`skipped` by majority.
- A story with no signal history returns `no signal yet`.
- Highest-|weight| fragments first, positive before negative on ties.

## Cold start

No fit number, no percentage, no score is displayed until the ledger has at
fewer than 5 sentiment-bearing events. Before that the queue is chronological
(newest first) and receipts read `no signal yet`. The TUI shows the count
remaining ("N ratings until ranking") instead of a fake fit %.

Threshold is 5, matching the onboarding promise ("rate 5 stories, see the
queue reorder"). Rates contribute the rated story's terms with the rating's
polarity, so 5 ratings is genuine signal, not just counter movement. After the
threshold the ranking is live but receipts still never show a percentage —
v1 shows reasons, not confidence.

## Executable spec

`tests/ranker.test.ts` with a fake Store/Clock: cold-start threshold,
term weight from keeps and skips, source interest, receipt format for the
examples above, tie-break, decay behavior.
