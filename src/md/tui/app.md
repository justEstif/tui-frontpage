# TUI app

OpenTUI React (`@opentui/react` 0.8.x, `jsxImportSource: "@opentui/react"`,
React 19). Entry `src/tui/main.tsx` → `createCliRenderer()` + `createRoot()`;
`renderer.destroy()` on every shutdown path (spike gotcha). `console.log`
goes to the renderer overlay, never to stdout — debug via the daemon log.

## Screens

1. **Queue** (default) — ranked story list, one row per story:
   `title`, source, age, why-receipt (when warm). Selection follows `j/k`.
2. **Reader** — full extracted markdown of the selected story, header with
   title/source/why-line, footer with mark keys. Opens on `enter`, closes on
   `q`/`esc`.
3. **Capture** — input line: paste a URL → if it is an RSS/Atom feed, add a
   source; otherwise save the story immediately (extraction happens in the
   daemon). Open on `c`, submit `enter`, cancel `esc`.
4. **Status line** — always-visible bottom row: daemon state
   (`daemon pid N` / `daemon down`), queue count, ledger warmth
   (`ranking in 5 ratings` while cold), last poll time.

## Layout

Rail/reader split: narrow left rail (queue titles + receipts, ~40 cols) and
the reader pane filling the rest when a story is open. On terminals <80 cols
the rail takes the full width and the reader replaces it (no split).

## Keys

| Key       | Action                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| `j` / `k` | move selection down / up                                                                                           |
| `enter`   | open story in reader                                                                                               |
| `x`       | skip (dismiss + ledger `skip`)                                                                                     |
| `S`       | save for later (`saved = 1` + ledger `keep`)                                                                       |
| `m`       | mark read (ledger `read` with elapsed read_ms)                                                                     |
| `f`       | rate forward: cycle +1 → +2 → off                                                                                  |
| `h`       | rate against: cycle -1 → -2 → off                                                                                  |
| `u`       | undo last action on the selected story (restores state, appends compensating event — the ledger stays append-only) |
| `w`       | show full why receipt for the selection (expanded panel with all fragments and counts)                             |
| `c`       | capture input                                                                                                      |
| `q`       | close reader, or quit from queue                                                                                   |

Every preference key updates the queue order immediately (ranker recompute,
no debounce) and shows the why-receipt on the moved row.

## Onboarding

First run: the store has no user events and no stories → seed 5 demo stories
(`demoSeed()` in `src/tui/demo.ts`, fixed fixture text, marked
`topic: "demo"`), and walk the user: "rate 5 stories to teach frontpage"
(`f`/`h` over each, or `j` past). After the 5th rating, show the before/after
reorder animation-style (old order above, new ranked order below, 3 s) and
drop into the normal queue. Skippable with `esc` — queue stays chronological
until the ledger warms. Demo stories are deletable like any story; the seed
never re-runs.

## Executable spec

`tests/tui-logic.test.ts` covers everything that is logic, not pixels: key →
action mapping via a fake store, onboarding state machine, demo seed shape,
undo semantics (compensating events). Rendering itself is verified manually
per `docs` (opentui skill) — automated assertions target state, not escape
sequences.
