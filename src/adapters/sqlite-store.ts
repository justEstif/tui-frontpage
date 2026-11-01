// bun:sqlite Store — contract in src/md/adapters/sqlite-store.md and
// src/md/data/store.md. WAL mode, events append-only.
import { Database, type Statement } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import type { LedgerEvent, Source, Story, Store } from "../domain/ports";

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS stories (
  id         TEXT PRIMARY KEY,
  url        TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  source     TEXT,
  added_at   INTEGER NOT NULL,
  read_ms    INTEGER NOT NULL DEFAULT 0,
  text       TEXT,
  topic      TEXT,
  saved      INTEGER NOT NULL DEFAULT 0,
  dismissed  INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sources (
  url          TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  added_at     INTEGER NOT NULL,
  poll_hours   REAL NOT NULL DEFAULT 2,
  last_poll_ms INTEGER NOT NULL DEFAULT 0,
  kept         INTEGER NOT NULL DEFAULT 0,
  skipped      INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
  ts       INTEGER NOT NULL,
  kind     TEXT NOT NULL,
  story_id TEXT,
  target   TEXT NOT NULL
);
`;

type StoryRow = {
  id: string;
  url: string;
  title: string;
  source: string | null;
  added_at: number;
  read_ms: number;
  text: string | null;
  topic: string | null;
  saved: number;
  dismissed: number;
};

type SourceRow = {
  url: string;
  title: string;
  added_at: number;
  poll_hours: number;
  last_poll_ms: number;
  kept: number;
  skipped: number;
};

type EventRow = { ts: number; kind: LedgerEvent["kind"]; story_id: string | null; target: string };

function storyFromRow(r: StoryRow): Story {
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    source: r.source,
    addedAt: r.added_at,
    readMs: r.read_ms,
    text: r.text,
    topic: r.topic,
    saved: r.saved !== 0,
    dismissed: r.dismissed !== 0,
  };
}

function sourceFromRow(r: SourceRow): Source {
  return {
    url: r.url,
    title: r.title,
    addedAt: r.added_at,
    pollHours: r.poll_hours,
    lastPollMs: r.last_poll_ms,
    kept: r.kept,
    skipped: r.skipped,
  };
}

export function defaultDbPath(): string {
  return join(process.env.HOME ?? "~", ".config", "frontpage", "frontpage.db");
}

function storyMethods(db: Database): Pick<Store, "stories" | "story" | "addStory" | "updateStory"> {
  const byId = db.query("SELECT * FROM stories WHERE id = ?");
  const all = db.query("SELECT * FROM stories WHERE dismissed = 0 ORDER BY added_at DESC");
  return {
    async stories() {
      return (all.all() as StoryRow[]).map(storyFromRow);
    },
    async story(id: string) {
      const row = byId.get(id) as StoryRow | null;
      return row ? storyFromRow(row) : null;
    },
    async addStory(s) {
      const id = s.id ?? sha1(s.url);
      db.run(
        `INSERT OR IGNORE INTO stories (id, url, title, source, added_at, read_ms, text, topic, saved, dismissed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          s.url,
          s.title,
          s.source ?? null,
          s.addedAt,
          s.readMs ?? 0,
          s.text ?? null,
          s.topic ?? null,
          (s.saved ?? false) ? 1 : 0,
          (s.dismissed ?? false) ? 1 : 0,
        ],
      );
      return storyFromRow(byId.get(id) as StoryRow);
    },
    async updateStory(id, patch) {
      return updateStoryById(db, byId, id, patch);
    },
  };
}

function updateStoryById(db: Database, byId: Statement, id: string, patch: Partial<Story>): void {
  const row = byId.get(id) as StoryRow | null;
  if (!row) return;
  const next = { ...storyFromRow(row), ...patch };
  db.run(
    `UPDATE stories SET url = ?, title = ?, source = ?, added_at = ?, read_ms = ?, text = ?, topic = ?, saved = ?, dismissed = ? WHERE id = ?`,
    [
      next.url,
      next.title,
      next.source,
      next.addedAt,
      next.readMs,
      next.text,
      next.topic,
      next.saved ? 1 : 0,
      next.dismissed ? 1 : 0,
      id,
    ],
  );
}

function sourceMethods(db: Database): Pick<Store, "sources" | "addSource" | "updateSource"> {
  const byUrl = db.query("SELECT * FROM sources WHERE url = ?");
  const all = db.query("SELECT * FROM sources ORDER BY added_at DESC");
  return {
    async sources() {
      return (all.all() as SourceRow[]).map(sourceFromRow);
    },
    async addSource(url, title) {
      db.run("INSERT OR IGNORE INTO sources (url, title, added_at) VALUES (?, ?, ?)", [
        url,
        title,
        Date.now(),
      ]);
      return sourceFromRow(byUrl.get(url) as SourceRow);
    },
    async updateSource(url, patch) {
      const row = byUrl.get(url) as SourceRow | null;
      if (!row) return;
      const next = { ...sourceFromRow(row), ...patch };
      db.run(
        `UPDATE sources SET title = ?, added_at = ?, poll_hours = ?, last_poll_ms = ?, kept = ?, skipped = ? WHERE url = ?`,
        [next.title, next.addedAt, next.pollHours, next.lastPollMs, next.kept, next.skipped, url],
      );
    },
  };
}

export function openStore(path?: string): Store {
  const dbPath = path ?? defaultDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  const allEvents = db.query("SELECT ts, kind, story_id, target FROM events ORDER BY ts");
  return {
    async init() {
      db.exec(SCHEMA);
    },
    ...storyMethods(db),
    ...sourceMethods(db),
    async appendEvent(e: LedgerEvent) {
      db.run("INSERT INTO events (ts, kind, story_id, target) VALUES (?, ?, ?, ?)", [
        e.ts,
        e.kind,
        e.storyId,
        e.target,
      ]);
    },
    async events() {
      return (allEvents.all() as EventRow[]).map((r) => ({
        ts: r.ts,
        kind: r.kind,
        storyId: r.story_id,
        target: r.target,
      }));
    },
    dbPath() {
      return dbPath;
    },
  };
}
