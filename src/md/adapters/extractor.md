# Adapter: extractor

Implements `Extractor` (`src/md/ports.md`). Readability extraction to
markdown.

- defuddle as the **npm package**, imported as default export (spike-proven;
  a named import fails at runtime):

  ```ts
  import Defuddle from "defuddle";
  import { parseHTML } from "linkedom";

  const doc = parseHTML(html).document;
  const result = new Defuddle(doc, url).parse(); // { title, content, ... }
  ```

- `content` (HTML) is converted to markdown — small local converter over
  linkedom nodes (headings, paragraphs, lists, links, code blocks, images
  dropped). No extra markdown dependency in v1.
- Fetches with the same `User-Agent` and 10 s timeout rules as the
  feed-fetcher, and respects robots.txt the same way (shared robots module
  under `src/adapters/robots.ts`).
- Returns `{ ok: true, title, text }` or `{ ok: false, error }`; never throws
  across the port boundary. Empty/`<200`-word content counts as
  `ok: false, error: "no readable content"` — paywall walls and app shells
  become errors, not garbage text.
- Runs from the daemon process (poll + capture), never from the TUI render
  path. The TUI writes a `capture` request into the store/queue; the daemon
  extracts.

## Executable spec

`tests/extractor.test.ts` with local fixture HTML: article → markdown with
title, paywall/empty → error, link/list/code preserved.
