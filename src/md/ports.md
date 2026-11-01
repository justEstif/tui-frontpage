# Ports

The hexagon's edges. The domain imports **only** these types and nothing from
`adapters/`, `bun:sqlite`, `node:fs`, or `fetch`. Signatures (TypeScript,
`src/domain/ports.ts`):

```ts
export type Story = {
  id: string;
  url: string;
  title: string;
  source: string | null;
  addedAt: number; // epoch ms
  readMs: number;
  text: string | null; // markdown
  topic: string | null;
  saved: boolean;
  dismissed: boolean;
};

export type Source = {
  url: string; // feed URL
  title: string;
  addedAt: number;
  pollHours: number;
  lastPollMs: number;
  kept: number;
  skipped: number;
};

export type EventKind = "rate" | "keep" | "skip" | "read" | "capture";

export type LedgerEvent = {
  ts: number;
  kind: EventKind;
  storyId: string | null;
  target: string;
};

export interface Store {
  init(): Promise<void>;
  stories(): Promise<Story[]>; // not dismissed, not read past threshold
  story(id: string): Promise<Story | null>;
  addStory(s: Omit<Story, "id"> & { id?: string }): Promise<Story>;
  updateStory(id: string, patch: Partial<Story>): Promise<void>;
  sources(): Promise<Source[]>;
  addSource(url: string, title: string): Promise<Source>;
  updateSource(url: string, patch: Partial<Source>): Promise<void>;
  appendEvent(e: LedgerEvent): Promise<void>;
  events(): Promise<LedgerEvent[]>; // whole ledger; ranker derives weights
  dbPath(): string;
}

export interface FeedFetcher {
  // Parse an RSS or Atom feed into story candidates. Implementations must
  // respect robots.txt and return an error result rather than throwing on
  // network/parse failure.
  fetchFeed(feedUrl: string): Promise<
    | { ok: true; title: string; items: { url: string; title: string }[] }
    | { ok: false; error: string }
  >;
}

export interface Extractor {
  // Fetch a URL and reduce it to readable markdown. Respect robots.txt.
  extract(url: string): Promise<
    | { ok: true; title: string; text: string } // text = markdown
    | { ok: false; error: string }
  >;
}

export interface Clock {
  now(): number; // epoch ms
}

export interface Scheduler {
  // Run the poll loop until the process is told to stop. The scheduler owns
  // the pidfile for the duration; it must not be started twice.
  run(poll: () => Promise<void>): Promise<void>;
  isRunning(): Promise<boolean>;
}
```

## Rules

- Result objects, not exceptions, for everything crossing a network or parse
  boundary (`FeedFetcher`, `Extractor`). Domain code never try/catches them.
- Domain functions take `Store` and `Clock` as parameters; no module-level
  singletons, so tests inject fakes.
- The TUI may import ports _and_ adapters; the domain may not.
