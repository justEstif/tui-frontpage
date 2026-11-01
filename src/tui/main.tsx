// TUI entry — contract in src/md/tui/app.md.
// createCliRenderer + createRoot; renderer.destroy() on every shutdown path
// (spike gotcha). The binary entry (index.ts) dispatches here.
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app";

export async function startTui(): Promise<void> {
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(<App />);
  const shutdown = (): void => {
    try {
      renderer.destroy();
    } catch {
      // already destroyed
    }
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (import.meta.main) await startTui();
