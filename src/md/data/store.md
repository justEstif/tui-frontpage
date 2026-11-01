# Store

One SQLite database, two processes. bun:sqlite in WAL mode so the daemon can
write poll results while the TUI reads.

- Path: `~/.config/frontpage/frontpage.db` (mkdir -p on open).
- Open with `PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;`
- Daemon pidfile: `~/.config/frontpage/daemon.pid`. Whoever holds it is the
  single poll owner. The TUI never polls; the daemon never renders.

## Tables

### stories

```sql
CREATE TABLE stories (
  id         TEXT PRIMARY KEY,   -- sha1 of url
  url        TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  source     TEXT,               -- sources.url when feed-captured, NULL for manual
  added_at   INTEGER NOT NULL,   -- epoch ms
  read_ms    INTEGER NOT NULL DEFAULT 0,
  text       TEXT,               -- extracted markdown; NULL until extracted
  topic      TEXT,
  saved      INTEGER NOT NULL DEFAULT 0,
  dismissed  INTEGER NOT NULL DEFAULT 0
);
```

### sources

```sql
CREATE TABLE sources (
  url          TEXT PRIMARY KEY,  -- feed URL
  title        TEXT NOT NULL,
  added_at     INTEGER NOT NULL,
  poll_hours   REAL NOT NULL DEFAULT 2,
  last_poll_ms INTEGER NOT NULL DEFAULT 0,
  kept         INTEGER NOT NULL DEFAULT 0,   -- stories kept from this feed
  skipped      INTEGER NOT NULL DEFAULT 0    -- stories skipped from this feed
);
```

### events (append-only)

```sql
CREATE TABLE events (
  ts       INTEGER NOT NULL,   -- epoch ms
  kind     TEXT NOT NULL,      -- 'rate' | 'keep' | 'skip' | 'read' | 'capture'
  story_id TEXT,               -- NULL for capture-subscribe events
  target   TEXT NOT NULL       -- kind payload: rating value, feed/story url, ms
);
```

No UPDATE or DELETE on events, ever. It is the training ledger the ranker
reads; the aggregate columns on `sources` and story `read_ms` are derived
caches, the ledger is the truth.

## Rules

- All writes go through the `Store` port (`src/md/ports.md`); nothing else
  opens the database.
- The ranker derives weights from `events` at read time — no weight table in
  v1. Rebuild semantics must survive a fresh database (cold start).
- Every story mutation that expresses a preference also appends an event:
  keep → `keep`, skip → `skip`, mark → `read` with read_ms, rate → `rate`.
- The pidfile check is `kill(pid, 0)`; a stale pidfile (dead pid or unparseable)
  is claimed, not an error.

## Executable spec

`tests/store.test.ts`: create in a temp dir, insert story/source/event, verify
WAL mode is on, verify append-only events survive a reopen, verify two
connections see each other's writes, verify stale-pidfile takeover.
