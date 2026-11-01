// Ports live here — see src/md/ports.md for the contract. Builders fill in.
export type EventKind = "rate" | "keep" | "skip" | "read" | "capture";

export type Story = {
  id: string;
  url: string;
  title: string;
  source: string | null;
  addedAt: number;
  readMs: number;
  text: string | null;
  topic: string | null;
  saved: boolean;
  dismissed: boolean;
};

export type Source = {
  url: string;
  title: string;
  addedAt: number;
  pollHours: number;
  lastPollMs: number;
  kept: number;
  skipped: number;
};

export type LedgerEvent = { ts: number; kind: EventKind; storyId: string | null; target: string };

export interface Store {
  init(): Promise<void>;
  stories(): Promise<Story[]>;
  story(id: string): Promise<Story | null>;
  addStory(s: Omit<Story, "id"> & { id?: string }): Promise<Story>;
  updateStory(id: string, patch: Partial<Story>): Promise<void>;
  sources(): Promise<Source[]>;
  addSource(url: string, title: string): Promise<Source>;
  updateSource(url: string, patch: Partial<Source>): Promise<void>;
  appendEvent(e: LedgerEvent): Promise<void>;
  events(): Promise<LedgerEvent[]>;
  dbPath(): string;
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export interface FeedFetcher {
  fetchFeed(
    feedUrl: string,
  ): Promise<Result<{ title: string; items: { url: string; title: string }[] }>>;
}

export interface Extractor {
  extract(url: string): Promise<Result<{ title: string; text: string }>>;
}

export interface Clock {
  now(): number;
}

export interface Scheduler {
  run(poll: () => Promise<void>): Promise<void>;
  isRunning(): Promise<boolean>;
}
