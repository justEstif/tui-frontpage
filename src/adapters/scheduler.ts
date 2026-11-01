// Daemon scheduler (`frontpage d`) — contract in src/md/adapters/scheduler.md.
// Owns the pidfile (single poll owner); polls due feeds and extracts.
import type { Scheduler } from "../domain/ports";
import { openStore } from "./sqlite-store";
import { feedFetcher } from "./feed-fetcher";
import { extractor } from "./extractor";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

const TICK_MS = 60_000;
const MAX_EXTRACTS_PER_TICK = 5;

export function stateDir(): string {
  return join(process.env.HOME ?? "~", ".config", "frontpage");
}
export function pidPath(): string {
  return join(stateDir(), "daemon.pid");
}
export function logPath(): string {
  return join(stateDir(), "daemon.log");
}

function log(msg: string): void {
  try {
    appendFileSync(logPath(), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    // logging must never kill the daemon
  }
}

export function readPid(): number | null {
  try {
    const pid = Number(readFileSync(pidPath(), "utf8").trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function daemonRunning(): Promise<boolean> {
  const pid = readPid();
  return pid !== null && pidAlive(pid);
}

/** Claim the pidfile. Throws when a live daemon already holds it. */
export function claimPidfile(): void {
  const pid = readPid();
  if (pid !== null && pidAlive(pid)) {
    throw new Error(`daemon already running (pid ${pid})`);
  }
  writeFileSync(pidPath(), String(process.pid)); // stale/missing → claim
}

export function releasePidfile(): void {
  const pid = readPid();
  if (pid === process.pid) rmSync(pidPath(), { force: true });
}

export const scheduler: Scheduler = {
  async run(poll) {
    claimPidfile();
    log(`daemon started (pid ${process.pid})`);
    let stopping = false;
    let stopNow: () => void = () => {};
    const stopped = new Promise<void>((resolve) => (stopNow = resolve));
    const stop = () => {
      stopping = true;
      stopNow();
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    const tick = async () => {
      try {
        await poll();
      } catch (e) {
        log(`poll error: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    await tick();
    while (!stopping) {
      const sleep = new Promise<void>((r) => setTimeout(r, TICK_MS));
      await Promise.race([stopped, sleep]);
      if (stopping) break;
      await tick();
    }
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
    releasePidfile();
    log("daemon stopped");
  },

  async isRunning() {
    return daemonRunning();
  },
};

// --- Poll implementation: the injected poll() body for the real daemon. ---

async function pollSource(
  store: ReturnType<typeof openStore>,
  src: { url: string; lastPollMs: number; pollHours: number },
): Promise<void> {
  const result = await feedFetcher.fetchFeed(src.url);
  if (!result.ok) {
    log(`feed ${src.url}: ${result.error}`);
    return;
  }
  const known = new Set((await store.stories()).map((s) => s.url));
  for (const item of result.items) {
    if (known.has(item.url)) continue;
    await store.addStory({
      url: item.url,
      title: item.title,
      source: src.url,
      addedAt: Date.now(),
      readMs: 0,
      text: null,
      topic: null,
      saved: false,
      dismissed: false,
    });
  }
}

export async function pollOnce(store = openStore()): Promise<void> {
  const now = Date.now();
  for (const src of await store.sources()) {
    if (now - src.lastPollMs < src.pollHours * 3600_000) continue;
    await pollSource(store, src);
    await store.updateSource(src.url, { lastPollMs: Date.now() });
  }
  // Extract up to 5 stories that still have no text.
  let extracted = 0;
  for (const story of await store.stories()) {
    if (extracted >= MAX_EXTRACTS_PER_TICK) break;
    if (story.text !== null) continue;
    const result = await extractor.extract(story.url);
    if (result.ok) {
      await store.updateStory(story.id, { text: result.text });
    } else {
      log(`extract ${story.url}: ${result.error}`);
    }
    extracted += 1;
  }
}

// --- `frontpage d` entry ---

function isMain(): boolean {
  return process.argv[1] !== undefined && import.meta.path === process.argv[1];
}

export async function daemonMain(args: string[]): Promise<void> {
  if (args.includes("--stop")) {
    const pid = readPid();
    if (pid === null || !pidAlive(pid)) {
      console.log("daemon not running");
      rmSync(pidPath(), { force: true }); // stale pidfile cleanup
      return;
    }
    process.kill(pid, "SIGTERM");
    console.log(`daemon stopped (pid ${pid})`);
    return;
  }
  if (await daemonRunning()) {
    const pid = readPid();
    console.log(`daemon already running (pid ${pid})`);
    return;
  }
  if (!args.includes("--child")) {
    // Detached spawn; the child writes its own pidfile.
    const child = spawn(process.execPath, [import.meta.path, "--child"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    console.log(`daemon started (pid ${child.pid})`);
    return;
  }
  await scheduler.run(pollOnce);
}

if (isMain()) {
  daemonMain(process.argv.slice(2));
}
