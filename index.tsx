// `frontpage` binary entry. No args = TUI (real app, src/md/tui/app.md);
// `d [--stop]` = daemon (already built). The TUI never polls — the daemon is
// the single poll owner.
import { daemonMain } from "./src/adapters/scheduler";

const args = process.argv.slice(2);

if (args[0] === "d") {
  await daemonMain(args.slice(1));
} else if (args.length === 0) {
  const { startTui } = await import("./src/tui/main.tsx");
  await startTui();
} else {
  console.log("usage: frontpage [d [--stop]]");
  process.exit(1);
}
