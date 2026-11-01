// TUI component render tests — OpenTUI in-memory renderer (no host terminal).
import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import type { RankedStory } from "../src/domain/ranker";
import { makeStory } from "./fakes";
import { QueueList, ReaderPane, WhyPanel } from "../src/tui/screens";
import { StatusLine, lastPollLabel } from "../src/tui/status";

const NOW = 1_000_000_000;

function ranked(
  id: string,
  over: { story?: Partial<ReturnType<typeof makeStory>> } & Partial<RankedStory> = {},
): RankedStory {
  const { story: storyOver, ...rest } = over;
  const story = makeStory({ id, title: `Story ${id}`, addedAt: NOW - 120_000, ...storyOver });
  return { story, score: 1.5, receipt: "sqlite +1.0 (2 kept)", ...rest };
}

describe("rendered screens (in-memory frames)", () => {
  test("queue list shows title, age, marker, selection caret", async () => {
    const setup = await testRender(
      <QueueList queue={[ranked("a"), ranked("b")]} sel={1} nowMs={NOW} width={80} />,
      { width: 60, height: 6 },
    );
    try {
      const frame = await setup.waitForFrame((f) => f.includes("Story a"));
      expect(frame).toContain("Story a");
      expect(frame).toContain("Story b");
      expect(frame).toContain("2m");
      expect(frame).toContain("◄"); // selection on row b
    } finally {
      setup.renderer.destroy();
    }
  });

  test("reader pane shows title, source, why receipt and footer keys", async () => {
    const setup = await testRender(<ReaderPane story={ranked("r1")} nowMs={NOW} />, {
      width: 60,
      height: 10,
    });
    try {
      const frame = await setup.waitForFrame((f) => f.includes("Story r1"));
      expect(frame).toContain("why:");
      expect(frame).toContain("sqlite +1.0 (2 kept)");
      expect(frame).toContain("m read");
    } finally {
      setup.renderer.destroy();
    }
  });

  test("why panel shows the score and receipt", async () => {
    const setup = await testRender(<WhyPanel story={ranked("w1")} score={2.5} />, {
      width: 50,
      height: 8,
    });
    try {
      const frame = await setup.waitForFrame((f) => f.includes("score: 2.50"));
      expect(frame).toContain("why this ranking");
    } finally {
      setup.renderer.destroy();
    }
  });

  test("status line shows daemon state, queue count, cold-start warmth", async () => {
    const setup = await testRender(
      <StatusLine
        daemon="daemon down"
        queueCount={12}
        coldNotice="5 ratings until ranking"
        lastPoll="2m ago"
      />,
      { width: 70, height: 3 },
    );
    try {
      const frame = await setup.waitForFrame((f) => f.includes("daemon down"));
      expect(frame).toContain("queue 12");
      expect(frame).toContain("5 ratings until ranking");
      expect(frame).toContain("last poll 2m ago");
    } finally {
      setup.renderer.destroy();
    }
  });
});

test("lastPollLabel formats poll recency", () => {
  expect(lastPollLabel(null, NOW)).toBeNull();
  expect(lastPollLabel(0, NOW)).toBeNull();
  expect(lastPollLabel(NOW - 30_000, NOW)).toBe("1m ago");
  expect(lastPollLabel(NOW - 5 * 60_000, NOW)).toBe("5m ago");
  expect(lastPollLabel(NOW - 3 * 3600_000, NOW)).toBe("3h ago");
});
