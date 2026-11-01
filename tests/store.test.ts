import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../src/adapters/sqlite-store";
import {
  daemonRunning,
  pidPath,
  readPid,
  claimPidfile,
  releasePidfile,
} from "../src/adapters/scheduler";

function newStory(url: string, title: string, addedAt: number) {
  return {
    url,
    title,
    addedAt,
    readMs: 0,
    text: null,
    topic: null,
    saved: false,
    dismissed: false,
  };
}

function tempDb(): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "frontpage-test-"));
  return { dir, path: join(dir, "frontpage.db") };
}

describe("sqlite store", () => {
  test("round-trips stories, sources, events", async () => {
    const { dir, path } = tempDb();
    const store = openStore(path);
    await store.init();
    const added = await store.addStory({ url: "https://x/1", title: "One", addedAt: 100 });
    expect(added.id).toHaveLength(40); // sha1
    await store.addStory(newStory("https://x/2", "Two", 200));
    expect((await store.stories()).map((s) => s.title)).toEqual(["Two", "One"]); // added_at DESC
    await store.updateStory(added.id, { saved: true, text: "# hi" });
    expect((await store.story(added.id))?.saved).toBe(true);
    await store.updateStory(added.id, { dismissed: true });
    expect((await store.stories()).map((s) => s.title)).toEqual(["Two"]); // dismissed filtered
    const src = await store.addSource("https://f/rss", "Feed");
    expect(src.pollHours).toBe(2);
    await store.updateSource(src.url, { kept: 3, lastPollMs: 5 });
    expect((await store.sources())[0]).toMatchObject({ kept: 3, lastPollMs: 5 });
    await store.appendEvent({ ts: 1, kind: "keep", storyId: added.id, target: added.id });
    expect(await store.events()).toEqual([
      { ts: 1, kind: "keep", storyId: added.id, target: added.id },
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  test("duplicate urls are ignored (idempotent insert)", async () => {
    const { dir, path } = tempDb();
    const store = openStore(path);
    const a = await store.addStory(newStory("https://x/1", "One", 1));
    const b = await store.addStory(newStory("https://x/1", "Overwrite", 2));
    expect(b.id).toBe(a.id);
    expect(b.title).toBe("One");
    expect((await store.stories()).length).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("WAL mode is on", () => {
    const { dir, path } = tempDb();
    openStore(path);
    // journal_mode is persistent; read it back through a raw query on the same file
    const { Database } = require("bun:sqlite");
    const db = new Database(path);
    expect(db.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("two connections see each other's writes; events append-only across reopen", async () => {
    const { dir, path } = tempDb();
    const writer = openStore(path);
    const reader = openStore(path);
    const s = await writer.addStory({
      url: "https://x/1",
      title: "One",
      addedAt: 1,
      readMs: 0,
      text: null,
      topic: null,
      saved: false,
      dismissed: false,
    });
    await writer.appendEvent({ ts: 1, kind: "skip", storyId: s.id, target: s.id });
    expect((await reader.stories()).length).toBe(1);
    expect((await reader.events())[0]?.kind).toBe("skip");
    // Reopen: events survive, no UPDATE/DELETE ever touched them.
    const reopened = openStore(path);
    await reopened.appendEvent({ ts: 2, kind: "keep", storyId: s.id, target: s.id });
    const events = await reopened.events();
    expect(events.map((e) => e.kind)).toEqual(["skip", "keep"]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("pidfile", () => {
  test("stale pidfile is claimed, live pid is rejected, stop removes it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "frontpage-pid-"));
    process.env.HOME = dir;
    mkdirSync(join(dir, ".config", "frontpage"), { recursive: true });
    expect(await daemonRunning()).toBe(false);
    // stale: unparseable, then dead pid
    writeFileSync(pidPath(), "not-a-pid");
    expect(readPid()).toBeNull();
    expect(await daemonRunning()).toBe(false);
    writeFileSync(pidPath(), "999999999");
    expect(await daemonRunning()).toBe(false);
    // claim succeeds over stale
    claimPidfile();
    expect(readPid()).toBe(process.pid);
    expect(await daemonRunning()).toBe(true);
    // live pid: claiming again throws
    let threw = false;
    try {
      claimPidfile();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    releasePidfile();
    expect(await daemonRunning()).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });
});
