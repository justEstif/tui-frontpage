import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStore } from "../src/adapters/sqlite-store";
import { daemonRunning, pollOnce, pidPath, readPid, scheduler } from "../src/adapters/scheduler";
import { rssFor } from "./fixtures";

function withHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "frontpage-sched-"));
  mkdirSync(join(dir, ".config", "frontpage"), { recursive: true });
  process.env.HOME = dir;
  return dir;
}

function serve(makeBody: (base: string) => (path: string) => string): {
  url: string;
  stop: () => void;
} {
  let handler: (path: string) => string = () => "";
  const server = Bun.serve({
    port: 0,
    fetch: (req) => new Response(handler(new URL(req.url).pathname)),
  });
  const base = `http://localhost:${server.port}`;
  handler = makeBody(base);
  return { url: `${base}/rss.xml`, stop: () => server.stop(true) };
}

describe("scheduler daemon", () => {
  test("double-start is rejected", async () => {
    const dir = withHome();
    writeFileSync(pidPath(), String(process.pid));
    expect(await scheduler.isRunning()).toBe(true);
    let msg = "";
    try {
      await scheduler.run(async () => {});
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toContain("daemon already running");
    rmSync(pidPath(), { force: true });
    rmSync(dir, { recursive: true, force: true });
  });

  test("run() claims the pidfile and SIGTERM releases it", async () => {
    const dir = withHome();
    process.on("SIGTERM", () => {}); // isolate: scheduler's handler runs, process survives in test
    const runPromise = scheduler.run(async () => {});
    await Bun.sleep(50);
    expect(readPid()).toBe(process.pid);
    process.kill(process.pid, "SIGTERM");
    await runPromise;
    expect(await daemonRunning()).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("pollOnce: due feed harvested, not-due skipped, extraction bounded", async () => {
    const dir = withHome();
    const feed = serve(
      (base) => (path) =>
        path === "/rss.xml" ? rssFor(base) : "<html><body>not an article</body></html>",
    );
    const feedUrl = feed.url;
    const store = openStore(join(dir, "db.sqlite"));
    await store.addSource(feedUrl, "Feed");
    // Not due yet:
    await store.updateSource(feedUrl, { lastPollMs: Date.now(), pollHours: 24 });
    await pollOnce(store);
    expect((await store.stories()).length).toBe(0);
    // Due:
    await store.updateSource(feedUrl, { lastPollMs: Date.now() - 25 * 3600_000 });
    await pollOnce(store);
    const stories = await store.stories();
    expect([...stories].map((s) => s.title).sort()).toEqual(["Post One", "Post Two"]);
    expect(stories.every((s) => s.source === feedUrl)).toBe(true);
    // Extraction: all 2 stories have text NULL; the extractor will hit the feed
    // URL (garbage) and record errors, but must not throw.
    await pollOnce(store);
    expect((await store.sources())[0].lastPollMs).toBeGreaterThan(0);
    feed.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  test("dedupe: second poll inserts no duplicates", async () => {
    const dir = withHome();
    const feed = serve(
      (base) => (path) =>
        path === "/rss.xml" ? rssFor(base) : "<html><body>not an article</body></html>",
    );
    const feedUrl = feed.url;
    const store = openStore(join(dir, "db.sqlite"));
    await store.addSource(feedUrl, "Feed");
    await store.updateSource(feedUrl, { pollHours: 0 });
    await pollOnce(store);
    await pollOnce(store);
    expect((await store.stories()).length).toBe(2);
    feed.stop();
    rmSync(dir, { recursive: true, force: true });
  });
});
