# Adapter: feed-fetcher

Implements `FeedFetcher` (`src/md/ports.md`). Plain `fetch`, no dependencies
beyond the stdlib.

- Accepts RSS 2.0 and Atom; detect by root element (`<rss>` / `<feed>`), parse
  with linkedom's `parseHTML` (it handles XML well enough for both formats in
  v1) — no dedicated XML dependency.
- Returns `{ ok: true, title, items }` with absolute item URLs, or
  `{ ok: false, error }` for network failure, non-2xx, or unparseable body.
  Never throws across the port boundary.
- **robots.txt**: before fetching a host, fetch `/robots.txt` (cache per host
  for the process lifetime, 1 hour TTL). If the feed path is disallowed,
  return `{ ok: false, error: "disallowed by robots.txt" }`. No robots file
  (404/410) means allowed; 4xx-other and 5xx mean be conservative (skip).
- Identify with `User-Agent: frontpage/0.1 (+https://github.com/justEstif/tui-frontpage)`.
- Timeout every request at 10 s via `AbortSignal.timeout`.
- Item discovery returns at most the newest 50 items per poll; dedupe by URL
  happens in the caller (daemon), not here.

## Executable spec

`tests/feed-fetcher.test.ts` against a local fixture server: RSS parse, Atom
parse, robots-disallowed, robots-missing, timeout, non-2xx, malformed XML.
