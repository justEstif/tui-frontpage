// TUI logic spec — src/md/tui/app.md: seed, onboarding machine, keys, undo.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demoSeed } from "../src/tui/demo";
import {
  doneEvent,
  isOnboardingDone,
  needsOnboarding,
  onboardTick,
  ONBOARD_RATINGS,
} from "../src/tui/onboarding";
import { applyCapture, isFeedUrl, normalizeUrl } from "../src/tui/capture";
import { mapKey } from "../src/tui/keys";
import { Controller } from "../src/tui/controller";
import { fakeClock, fakeStore } from "./fakes";

process.env.HOME = mkdtempSync(join(tmpdir(), "fp-tui-")); // daemon status reads here

describe("demo seed", () => {
  test("12 plausible stories, varied topics, marked demo, never dismissed", () => {
    const seed = demoSeed(1_000_000);
    expect(seed.length).toBe(12);
    expect(new Set(seed.map((s) => s.id)).size).toBe(12);
    expect(new Set(seed.map((s) => s.title)).size).toBe(12);
    for (const s of seed) {
      expect(s.topic).toBe("demo");
      expect(s.text).not.toBeNull();
      expect(s.source).not.toBeNull();
      expect(s.dismissed).toBe(false);
    }
  });
});

describe("onboarding state machine", () => {
  test("fresh store triggers; any story or event suppresses it", () => {
    const { makeStory } = require("./fakes") as typeof import("./fakes");
    expect(needsOnboarding([], [])).toBe(true);
    expect(needsOnboarding([makeStory({ id: "a" })], [])).toBe(false);
    expect(needsOnboarding([], [{ ts: 0, kind: "skip", storyId: "a", target: "x" }])).toBe(false);
  });

  test("rate ticks advance; done sentinel is a capture event (zero sentiment)", () => {
    let tick: ReturnType<typeof onboardTick> = { phase: "rate", rated: 0 };
    for (let i = 0; i < ONBOARD_RATINGS; i++) tick = onboardTick(tick, { type: "rate" });
    expect(tick).toEqual({ phase: "rate", rated: ONBOARD_RATINGS });
    const ev = doneEvent(5);
    expect(ev.kind).toBe("capture");
    expect(isOnboardingDone([ev])).toBe(true);
  });

  test("skip-all and finish end onboarding", () => {
    expect(onboardTick({ phase: "rate", rated: 2 }, { type: "skip-all" }).phase).toBe("done");
    expect(onboardTick({ phase: "rate", rated: 2 }, { type: "finish" }).phase).toBe("done");
  });
});

describe("capture", () => {
  test("feed heuristics", () => {
    expect(isFeedUrl("https://blog.example/feed.xml")).toBe(true);
    expect(isFeedUrl("https://blog.example/feed/")).toBe(true);
    expect(isFeedUrl("https://blog.example/post/1")).toBe(false);
  });

  test("normalizeUrl adds scheme, rejects garbage", () => {
    expect(normalizeUrl("  blog.example/post ")).toBe("https://blog.example/post");
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });

  test("story capture stores the story and appends a capture event", async () => {
    const store = fakeStore();
    const out = await applyCapture(store, fakeClock(7), "example.com/a");
    expect(out.kind).toBe("story");
    expect((await store.stories()).length).toBe(1);
    expect((await store.events())[0]?.kind).toBe("capture");
  });

  test("feed capture adds a source, not a story", async () => {
    const store = fakeStore();
    const out = await applyCapture(store, fakeClock(7), "https://blog.example/feed.xml");
    expect(out).toEqual({ kind: "source", title: "https://blog.example/feed.xml" });
    expect((await store.stories()).length).toBe(0);
    expect((await store.sources()).length).toBe(1);
  });
});

describe("key mapping", () => {
  const k = (sequence: string, name?: string) => ({ sequence, name: name ?? sequence });

  test("queue keys per app.md", () => {
    expect(mapKey(k("j"), "queue")).toBe("move-down");
    expect(mapKey(k("k"), "queue")).toBe("move-up");
    expect(mapKey({ name: "return", sequence: "\r" }, "queue")).toBe("open");
    expect(mapKey(k("x"), "queue")).toBe("skip");
    expect(mapKey(k("S"), "queue")).toBe("save");
    expect(mapKey(k("s"), "queue")).toBe("none"); // lowercase s is not save
    expect(mapKey(k("f"), "queue")).toBe("rate-forward");
    expect(mapKey(k("h"), "queue")).toBe("rate-against");
    expect(mapKey(k("u"), "queue")).toBe("undo");
    expect(mapKey(k("w"), "queue")).toBe("why");
    expect(mapKey(k("c"), "queue")).toBe("capture");
    expect(mapKey(k("q"), "queue")).toBe("quit");
  });

  test("reader keys: h/m/f/u/w, q and esc close", () => {
    expect(mapKey(k("m"), "reader")).toBe("mark-read");
    expect(mapKey(k("f"), "reader")).toBe("rate-forward");
    expect(mapKey(k("h"), "reader")).toBe("rate-against");
    expect(mapKey(k("u"), "reader")).toBe("undo");
    expect(mapKey(k("w"), "reader")).toBe("why");
    expect(mapKey(k("q"), "reader")).toBe("close-reader");
    expect(mapKey({ name: "escape" }, "reader")).toBe("close-reader");
    expect(mapKey(k("j"), "reader")).toBe("none");
  });
});

describe("controller over the store", () => {
  function make(): { c: Controller; store: ReturnType<typeof fakeStore> } {
    const store = fakeStore();
    const c = new Controller(store, fakeClock(1000), () => {});
    return { c, store };
  }

  test("boot on a fresh store seeds 12 demo stories and opens onboarding", async () => {
    const { c, store } = make();
    await c.boot();
    expect((await store.stories()).length).toBe(12);
    expect(c.getState().screen).toBe("onboarding");
    expect(c.getState().queue.length).toBe(12);
  });

  test("boot does not reseed once stories exist", async () => {
    const { c, store } = make();
    await c.boot();
    await c.boot();
    expect((await store.stories()).length).toBe(12);
  });

  test("five ratings complete onboarding and append the done sentinel", async () => {
    const { c, store } = make();
    await c.boot();
    for (let i = 0; i < 5; i++) {
      c.onKey({ name: "f", sequence: "f" });
      await new Promise((r) => setTimeout(r, 0));
    }
    const events = await store.events();
    expect(isOnboardingDone(events)).toBe(true);
  });

  test("x dismisses + appends skip; u restores + appends the compensating event", async () => {
    const { c, store } = make();
    await c.boot();
    c.onKey({ name: "escape" }); // skip onboarding flow for this test
    await new Promise((r) => setTimeout(r, 0));
    expect(c.getState().screen).toBe("queue");
    const first = c.getState().queue[0]!.story;
    c.onKey({ name: "x", sequence: "x" });
    await new Promise((r) => setTimeout(r, 0));
    expect((await store.story(first.id))?.dismissed).toBe(true);
    c.onKey({ name: "u", sequence: "u" });
    await new Promise((r) => setTimeout(r, 0));
    expect((await store.story(first.id))?.dismissed).toBe(false);
    const events = await store.events();
    const last = events[events.length - 1];
    expect(last?.kind).toBe("keep"); // compensates the skip, ledger append-only
  });

  test("S saves for later and bumps the source kept counter", async () => {
    const { c, store } = make();
    await c.boot();
    c.onKey({ name: "escape" });
    await new Promise((r) => setTimeout(r, 0));
    const first = c.getState().queue[0]!.story;
    if (first.source !== null) await store.addSource(first.source, "demo feed");
    c.onKey({ name: "s", sequence: "S" });
    await new Promise((r) => setTimeout(r, 0));
    expect((await store.story(first.id))?.saved).toBe(true);
    const src = (await store.sources()).find((s) => s.url === first.source);
    expect(src?.kept).toBe(1);
  });

  test("enter opens the reader on the selection; reader shows it; q closes", async () => {
    const { c } = make();
    await c.boot();
    c.onKey({ name: "escape" });
    await new Promise((r) => setTimeout(r, 0));
    const first = c.getState().queue[0]!.story;
    c.onKey({ name: "return", sequence: "\r" });
    expect(c.getState().screen).toBe("reader");
    expect(c.getState().readerId).toBe(first.id);
    c.onKey({ name: "q", sequence: "q" });
    expect(c.getState().screen).toBe("queue");
  });

  test("status line: cold notice counts down, daemon down on an empty state dir", async () => {
    const { c } = make();
    await c.boot();
    expect(c.getState().coldNotice).toBe(`${5 - 0} ratings until ranking` /* no user events yet */);
    expect(c.getState().daemon).toBe("daemon down");
  });
});
