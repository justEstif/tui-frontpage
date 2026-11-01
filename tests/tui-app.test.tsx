// Full App render against a fresh (onboarding) store — in-memory OpenTUI frame.
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testRender } from "@opentui/react/test-utils";
import { App } from "../src/tui/app";

test("app boots into onboarding with 12 seeded demo stories and a status line", async () => {
  process.env.HOME = mkdtempSync(join(tmpdir(), "fp-app-"));
  const setup = await testRender(<App />, { width: 100, height: 24 });
  try {
    const frame = await setup.waitForFrame(
      (f) => f.includes("SQLite WAL mode explained") && f.includes("queue 12"),
      { maxPasses: 80 },
    );
    writeFileSync("/tmp/tui-render.txt", frame); // proof dump: rendered screen as text
    expect(frame).toContain("rate 5 more stories to teach frontpage");
    expect(frame).toContain("daemon down"); // temp state dir: no daemon
    expect(frame).toContain("5 ratings until ranking"); // cold start
  } finally {
    setup.renderer.destroy();
  }
}, 20_000);
