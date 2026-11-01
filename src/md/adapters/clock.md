# Adapter: clock

Implements `Clock` (`src/md/ports.md`).

- `src/adapters/clock.ts` exports `systemClock: Clock` (`now() =>
  Date.now()`).
- Every ranker/store/scheduler function receives its clock as a parameter;
  tests pass a fake (`tests/fakes.ts` exports `fakeClock(startMs)` with a
  `set(ms)` mutator).
- No `Date.now()` anywhere outside this file and the fakes — lint/CI greps
  for it in `domain/` (arch test covers it).

## Executable spec

Nothing to test in the adapter itself; the ranker decay tests use the fake.
