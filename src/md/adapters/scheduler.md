# Adapter: scheduler (daemon)

Implements `Scheduler` (`src/md/ports.md`). The `frontpage d` subcommand —
a plain background process, no hc/herdr runtime dependency.

- Entry: `frontpage d` daemonizes (double-fork or plain `&` from the shell —
  v1 uses plain detached spawn; the process writes its own pidfile).
- **Pidfile**: `~/.config/frontpage/daemon.pid`. On start: if the file exists
  and `kill(pid, 0)` succeeds, exit with "daemon already running (pid N)".
  Stale pidfile (dead pid, unparseable) is claimed and overwritten.
- Poll loop: every tick, for each `sources` row where
  `now - last_poll_ms >= poll_hours * 3600_000`, fetch the feed, insert new
  story rows, extract text for stories with `text IS NULL` (bounded: at most
  5 extractions per tick), update `last_poll_ms`.
- The injected `poll()` callback is domain code (fresh stories through the
  ranker's inputs); the scheduler owns only timing, pidfile, and logging to
  `~/.config/frontpage/daemon.log`.
- Stops on SIGTERM/SIGINT: remove pidfile, exit 0.
- **Single poll owner** is this pidfile, enforced — the TUI never polls and
  never needs the scheduler.

## Executable spec

`tests/scheduler.test.ts` with temp dirs: pidfile claim, stale-pidfile
takeover, double-start rejection, tick honoring poll_hours, SIGTERM removes
pidfile.
