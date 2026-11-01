# tui-frontpage

A terminal reading queue: capture URLs, subscribe to RSS/Atom feeds, and get a
fit-ranked queue with a why-receipt for every ranking. Bun + OpenTUI (React
binding). Zero agent dependencies; a plain daemon polls feeds, the TUI reads
the same SQLite store.

## Shape

Hexagonal. The domain never imports SQL, fetch, the filesystem, or OpenTUI —
it only sees the ports in `src/md/ports.md`. Adapters implement ports. The TUI
composes domain + adapters. `tests/arch.test.ts` enforces the import rules and
is the executable version of this section.

Spike verdict (`spike.md`): OpenTUI + defuddle + linkedom survive
`bun build --compile` into one binary. Compile must pin libc via
`--define 'process.env.OPENTUI_LIBC="glibc"'` (or `musl`), because the default
resolution picks the musl native package.

## Decisions that bind the code

- Store: bun:sqlite, WAL mode, one file at `~/.config/frontpage/frontpage.db`.
  TUI and daemon are separate processes sharing it.
- Single poll owner: the daemon holds a pidfile in the store folder; the TUI
  never polls.
- Extraction: defuddle npm package (default export) + linkedom, markdown out.
  No exec of a global CLI.
- No fit percentage is ever shown while the ledger is cold (see ranker doc).
- Oversized code is a lint failure: 300 lines/file, 50/function, complexity 10.

## File Index

| File                              | Intent                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/md/README.md`                | This overview and the file index.                                                                     |
| `src/md/spike.md`                 | Spike record: versions, compile command, defuddle/OpentUI gotchas.                                    |
| `src/md/ports.md`                 | Hexagon ports: Store, FeedFetcher, Extractor, Clock, Scheduler signatures. Domain imports only these. |
| `src/md/data/store.md`            | Database layout: tables, WAL, path, pidfile, shared access, poll ownership.                           |
| `src/md/domain/ranker.md`         | Ranking semantics: term/interest weights, events in, why-receipt strings, cold-start rule.            |
| `src/md/adapters/sqlite-store.md` | bun:sqlite implementation of Store.                                                                   |
| `src/md/adapters/feed-fetcher.md` | RSS/Atom fetching over `fetch`, robots.txt respect.                                                   |
| `src/md/adapters/extractor.md`    | defuddle + linkedom extraction to markdown.                                                           |
| `src/md/adapters/clock.md`        | Time port implementation (injectable for tests).                                                      |
| `src/md/adapters/scheduler.md`    | `frontpage d` daemon: pidfile, interval polling.                                                      |
| `src/md/tui/app.md`               | Screens, keys, rail/reader layout, onboarding, demo seed.                                             |

Tests next to `tests/` are the executable spec for every contract above: if a
doc and a test disagree, the test wins and the doc gets fixed.
