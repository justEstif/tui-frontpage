/**
 * Hexagon boundary test. Every violation names the offending import.
 * Rules (src/md/README.md):
 *  - domain   imports only domain + ports (no adapters, no vendor, no bun/*)
 *  - adapters import domain + vendor only (never tui)
 *  - tui      imports domain + adapters (never reverse)
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src");

const VENDOR_PREFIXES = ["bun:", "node:", "react", "@opentui/", "defuddle", "linkedom"];

type Files = { path: string; ring: "domain" | "adapters" | "tui"; code: string }[];

function collect(dir: string, ring: Files[number]["ring"], acc: Files): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collect(p, ring, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push({ path: p, ring, code: readFileSync(p, "utf8") });
  }
}

function allFiles(): Files {
  const files: Files = [];
  for (const ring of ["domain", "adapters", "tui"] as const) {
    try {
      collect(join(SRC, ring), ring, files);
    } catch {
      // ring not created yet; vacuous pass until builders land it
    }
  }
  return files;
}

function imports(code: string): string[] {
  const out: string[] = [];
  const re =
    /(?:import|export)\s[^"'`]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

describe("architecture boundaries", () => {
  const files = allFiles();

  test("domain imports only domain", () => {
    for (const f of files.filter((x) => x.ring === "domain")) {
      for (const imp of imports(f.code)) {
        const isVendor = VENDOR_PREFIXES.some((p) => imp.startsWith(p));
        expect(isVendor, `${f.path} (domain) imports vendor '${imp}'`).toBe(false);
        expect(imp.includes("/adapters/"), `${f.path} (domain) imports '${imp}'`).toBe(false);
        expect(imp.includes("/tui/"), `${f.path} (domain) imports '${imp}'`).toBe(false);
      }
    }
  });

  test("adapters import domain + vendor only", () => {
    for (const f of files.filter((x) => x.ring === "adapters")) {
      for (const imp of imports(f.code)) {
        expect(imp.includes("/tui/"), `${f.path} (adapters) imports '${imp}'`).toBe(false);
      }
    }
  });

  test("tui may import domain + adapters, never the reverse", () => {
    for (const f of files.filter((x) => x.ring === "domain" || x.ring === "adapters")) {
      for (const imp of imports(f.code)) {
        expect(imp.includes("/tui/"), `${f.path} (${f.ring}) imports '${imp}'`).toBe(false);
      }
    }
  });
});
