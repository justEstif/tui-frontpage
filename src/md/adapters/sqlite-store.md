# Adapter: sqlite-store

Implements `Store` (`src/md/ports.md`) over `bun:sqlite`, WAL mode, at
`~/.config/frontpage/frontpage.db` — the layout in `src/md/data/store.md` is
the contract.

- One module, `src/adapters/sqlite-store.ts`, exporting
  `openStore(path?: string)` (default path for prod, explicit path for tests).
- Opens with `PRAGMA journal_mode = WAL` and `busy_timeout = 5000` (two
  processes share the file).
- Every mutating method that expresses a preference appends its ledger event
  in the same transaction as the row change (`keep`/`skip`/`read`/`rate`).
- `stories()` returns `dismissed = 0` rows ordered by `added_at DESC`; ranking
  order is applied by the ranker, not by SQL.
- Events table is insert-only: no UPDATE/DELETE statements against it exist
  in this file.
- Synchronous bun:sqlite calls wrapped in async signatures; never block the
  TUI render loop on a write — batch within one tick.

## Executable spec

`tests/store.test.ts` (see data/store.md): temp-dir open, round-trips, WAL on,
cross-connection visibility, event append-only across reopen, stale pidfile
takeover.
