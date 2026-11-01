import { describe, expect, test } from "bun:test";
import {
  coldStart,
  coldStartNotice,
  interestBySource,
  rankQueue,
  score,
  termScore,
  termWeights,
  whyReceipt,
} from "../src/domain/ranker";
import type { LedgerEvent, Source } from "../src/domain/ports";
import { fakeClock, makeStory } from "./fakes";

const NOW = 30 * 24 * 3600_000; // 30 days in
const clock = fakeClock(NOW);

function ev(
  kind: LedgerEvent["kind"],
  target: string,
  ageDays = 0,
  storyId: string | null = null,
): LedgerEvent {
  return { ts: NOW - ageDays * 24 * 3600_000, kind, storyId, target };
}

// A ledger past the cold-start threshold.
function warmEvents(extra: LedgerEvent[] = []): LedgerEvent[] {
  return [
    ev("keep", "https://a/1", 0, "s1"),
    ev("keep", "https://a/2", 0, "s2"),
    ev("keep", "https://a/3", 0, "s3"),
    ev("skip", "https://b/1", 0, "s4"),
    ev("skip", "https://b/2", 0, "s5"),
    ev("read", "40000", 0, "s6"),
    ev("rate", "2", 0, "s7"),
    ev("rate", "-1", 0, "s8"),
    ev("read", "60000", 0, "s10"),
    ev("rate", "1", 0, "s11"),
    ev("read", "1000", 0, "s9"), // no sentiment (<=30s)
    ev("capture", "https://feed/x", 0),
    ...extra,
  ];
}

function source(url: string, kept: number, skipped: number): Source {
  return { url, title: url, addedAt: 0, pollHours: 2, lastPollMs: 0, kept, skipped };
}

describe("cold start", () => {
  test("fewer than 5 sentiment events is cold", () => {
    expect(coldStart([ev("keep", "x"), ev("capture", "y"), ev("read", "1")])).toBe(true);
    expect(coldStart(warmEvents())).toBe(false);
  });

  test("cold queue is chronological newest first with no signal yet", () => {
    const stories = [
      makeStory({ id: "old", addedAt: 100 }),
      makeStory({ id: "new", addedAt: 200 }),
    ];
    const ranked = rankQueue(stories, [ev("keep", "old")], [], clock);
    expect(ranked.map((r) => r.story.id)).toEqual(["new", "old"]);
    expect(ranked.every((r) => r.receipt === "no signal yet" && r.score === 0)).toBe(true);
  });

  test("cold start notice counts down", () => {
    expect(coldStartNotice([ev("keep", "x")])).toBe("4 ratings until ranking");
    expect(coldStartNotice(warmEvents())).toBeNull();
  });
});

describe("term weights", () => {
  test("kept titles push terms up, skipped push down", () => {
    const events = [
      ev("keep", "rust terminal ship", 0, "a"),
      ev("skip", "crypto blockchain", 0, "b"),
      ...Array.from({ length: 8 }, (_, i) => ev("capture", `filler-${i}`)),
    ];
    const w = termWeights(events, NOW);
    expect((w.get("rust") ?? 0) > 0).toBe(true);
    expect((w.get("crypto") ?? 0) < 0).toBe(true);
    expect(w.get("terminal")).toBe(w.get("rust"));
    expect(w.get("filler-0")).toBeUndefined(); // capture carries no sentiment
  });

  test("weights are normalized to [-2, +2]", () => {
    const events = [ev("keep", "rust", 0, "a"), ev("keep", "rust", 0, "b"), ...warmEvents()];
    const w = termWeights(events, NOW);
    const rust = w.get("rust") ?? 0;
    expect(rust).toBeLessThanOrEqual(2);
    expect(w.get("terminal") ?? 0).toBeLessThanOrEqual(rust);
  });

  test("rate sentiment counts, read under 30s does not", () => {
    const events = [
      ev("rate", "2", 0), // +2 on no target terms
      ev("keep", "kubernetes", 0, "a"),
      ev("read", "5000", 0, "b"),
      ...warmEvents(),
    ];
    const w = termWeights(events, NOW);
    expect((w.get("kubernetes") ?? 0) > 0).toBe(true);
  });

  test("decay: older events weigh less (14-day half-life)", () => {
    const fresh = termWeights([ev("keep", "rust", 0, "a"), ...warmEvents()], NOW).get("rust") ?? 0;
    const old = termWeights([ev("keep", "rust", 28, "a"), ...warmEvents()], NOW).get("rust") ?? 0;
    expect(old).toBeLessThan(fresh);
    expect(old).toBeCloseTo(fresh / 4, 5); // two half-lives
  });
});

describe("source interest and score", () => {
  test("kept-heavy source outranks skipped-heavy source", () => {
    const interest = interestBySource([source("good", 5, 0), source("bad", 0, 5)]);
    expect((interest.get("good") ?? 0) > (interest.get("bad") ?? 0)).toBe(true);
    expect(interest.get("good")).toBe(2);
    expect(interest.get("bad")).toBe(-2);
  });

  test("termScore clamps long articles to [-2, +2]", () => {
    const w = new Map([["rust", 2]]);
    const long = makeStory({
      id: "x",
      title: "x",
      text: Array.from({ length: 100 }, () => "rust").join(" "),
    });
    expect(termScore(long, w)).toBe(2);
  });

  test("score = term + interest", () => {
    const events = warmEvents();
    const stories = [makeStory({ id: "r", title: "rust", source: "good" })];
    const w = termWeights(events, NOW);
    const expected = termScore(stories[0], w) + 2;
    expect(score(stories[0], events, [source("good", 3, 0)], NOW)).toBe(expected);
  });
});

describe("whyReceipt", () => {
  test("no signal history", () => {
    expect(whyReceipt(makeStory({ id: "s" }), [ev("capture", "https://x")], NOW)).toBe(
      "no signal yet",
    );
  });

  test("positive fragment format", () => {
    const events = [
      ev("keep", "terminal unix", 0, "a"),
      ev("keep", "terminal editor", 0, "b"),
      ...warmEvents(),
    ];
    const receipt = whyReceipt(makeStory({ id: "s", title: "a terminal story" }), events, NOW);
    expect(receipt).toMatch(/^terminal \+\d+\.\d+ \(2 kept\)$/);
  });

  test("mixed fragments, highest |weight| first, max 3, sign always visible", () => {
    const events = [
      ev("keep", "rust wasm", 0, "a"),
      ev("keep", "rust compiler", 0, "b"),
      ev("skip", "crypto coins", 0, "c"),
      ev("skip", "crypto scams", 0, "d"),
      ev("keep", "go routines", 0, "e"),
      ...warmEvents(),
    ];
    const receipt = whyReceipt(
      makeStory({ id: "s", title: "rust crypto go wasm compiler coins" }),
      events,
      NOW,
    );
    const fragments = receipt.split(", ");
    expect(fragments.length).toBe(3);
    for (const f of fragments) expect(f).toMatch(/^[\w-]+ [+-]\d+\.\d+ \(\d+ (kept|skipped)\)$/);
    expect(receipt).toContain("crypto -");
  });

  test("counts come from ledger events, not normalized score", () => {
    const events = [
      ev("keep", "rust", 0, "a"),
      ev("keep", "rust", 0, "b"),
      ev("keep", "rust", 0, "c"),
      ev("skip", "rust", 0, "d"),
      ...warmEvents(),
    ];
    const receipt = whyReceipt(makeStory({ id: "s", title: "rust" }), events, NOW);
    expect(receipt).toContain("(4 ");
  });
});

describe("rankQueue", () => {
  test("warm: ranked by score, ties break added_at DESC", () => {
    const events = warmEvents([ev("keep", "rust", 0, "a"), ev("keep", "rust", 0, "b")]);
    const stories = [
      makeStory({ id: "plain-old", title: "nothing special", addedAt: 100 }),
      makeStory({ id: "rust-new", title: "rust", addedAt: 50 }),
      makeStory({ id: "rust-old", title: "rust again", addedAt: 40 }),
    ];
    const ranked = rankQueue(stories, events, [], clock);
    expect(ranked[0].story.id).toBe("rust-new"); // same terms, newer wins tie
    expect(ranked.map((r) => r.story.id)).toContain("rust-old");
    expect(ranked[ranked.length - 1].story.id).toBe("plain-old");
    expect(ranked[0].receipt).not.toBe("no signal yet");
  });
});

describe("rate events carry the rated story's terms", () => {
  test("exactly 5 mixed ratings: order differs from chronological, receipt has real weights", () => {
    const stories = [
      makeStory({ id: "rust", title: "rust compiler news", addedAt: 100 }),
      makeStory({ id: "crypto", title: "crypto coin rally", addedAt: 90 }),
      makeStory({ id: "plain", title: "nothing special here", addedAt: 80 }),
      makeStory({ id: "rust2", title: "rust cargo tips", addedAt: 70 }),
    ];
    const events = [
      ev("rate", "2", 0, "rust"),
      ev("rate", "1", 0, "rust2"),
      ev("rate", "-2", 0, "crypto"),
      ev("rate", "1", 0, "rust"),
      ev("rate", "-1", 0, "crypto"),
    ];
    const ranked = rankQueue(stories, events, [], clock);
    // Chronological (newest first) would be rust, crypto, plain, rust2.
    expect(ranked.map((r) => r.story.id)).not.toEqual(["rust", "crypto", "plain", "rust2"]);
    expect(ranked[0].story.id).toMatch(/^rust/);
    expect(ranked[0].receipt).not.toBe("no signal yet");
    expect(ranked[0].receipt).toMatch(/^rust \+\d+\.\d+ \(\d+ rated\), /);
    // Negative ratings push the rated story's terms down.
    const crypto = ranked.find((r) => r.story.id === "crypto");
    expect(crypto?.receipt).toContain("crypto -");
    expect(coldStart(events)).toBe(false);
  });

  test("termWeights resolves rate events via storyId", () => {
    const stories = [makeStory({ id: "a", title: "kubernetes pods" })];
    const w = termWeights([ev("rate", "2", 0, "a")], NOW, stories);
    expect((w.get("kubernetes") ?? 0) > 0).toBe(true);
  });
});
