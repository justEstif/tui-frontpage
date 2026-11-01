/**
 * Entry-chain gate — guards the failure this file was added for:
 * the compiled binary must dispatch to the real TUI app, never print
 * "TUI not implemented yet". If this test fails, the binary entry is broken.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

describe("entry chain", () => {
  test("stub src/tui/main.ts is gone", () => {
    expect(existsSync(join(ROOT, "src/tui/main.ts"))).toBe(false);
  });

  test("entries import the real TUI app, no stub content", () => {
    for (const entry of ["index.ts", "index.tsx"]) {
      const code = read(entry);
      expect(code, `${entry} must import src/tui/main.tsx`).toContain(
        `import("./src/tui/main.tsx")`,
      );
      expect(code, `${entry} must dispatch 'd' to the daemon`).toContain(`daemonMain`);
      expect(code, `${entry} must not contain stub text`).not.toContain("not implemented");
    }
    const tuiEntry = read("src/tui/main.tsx");
    expect(tuiEntry).toContain(`from "./app"`);
    expect(tuiEntry).toContain("createCliRenderer");
    expect(read("src/tui/app.tsx")).toContain("export function App");
  });

  test("package.json points at real entries", () => {
    const pkg = JSON.parse(read("package.json")) as {
      module: string;
      scripts: Record<string, string>;
    };
    expect(pkg.module).not.toBe("src/tui/main.ts");
    expect(pkg.scripts.dev).not.toContain('src/tui/main.ts"');
  });
});
