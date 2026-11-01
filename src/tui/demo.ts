// Demo seed for onboarding — contract in src/md/tui/app.md.
// Fixed fixture text, marked topic "demo". Deleted like any story; never re-seeds.
import type { Story } from "../domain/ports";

type Seed = { id: string; title: string; url: string; source: string; text: string };

const SEEDS: Seed[] = [
  {
    id: "demo-01",
    title: "SQLite WAL mode explained",
    url: "https://demo.example/sqlite-wal",
    source: "https://demo.example/feed.xml",
    text: "Write-ahead logging lets readers and one writer share the database file. Checkpointing moves WAL frames back into the main database. Busy timeouts matter.",
  },
  {
    id: "demo-02",
    title: "The case for boring technology",
    url: "https://demo.example/boring-tech",
    source: "https://demo.example/feed.xml",
    text: "Novelty has a cost paid in incidents and on-call pages. Choose boring tools unless the new thing is the product. Innovation tokens should be spent deliberately.",
  },
  {
    id: "demo-03",
    title: "Terminal UI design patterns",
    url: "https://demo.example/tui-patterns",
    source: "https://demo.example/feed.xml",
    text: "Good TUIs keep the model small: a list, a selection, a status line. Vim keys travel well. Every screen needs an obvious way out.",
  },
  {
    id: "demo-04",
    title: "Why RSS refuses to die",
    url: "https://demo.example/rss-alive",
    source: "https://demo.example/feed.xml",
    text: "Feeds are push-neutral, decentralized, and trivially cacheable. Readers come and go; the format persists because publishers and hackers keep it alive.",
  },
  {
    id: "demo-05",
    title: "Hexagonal architecture in practice",
    url: "https://demo.example/hexagonal",
    source: "https://demo.example/feed.xml",
    text: "Ports and adapters isolate domain logic from infrastructure. The test suite enforces boundaries better than discipline does. Start from the ports.",
  },
  {
    id: "demo-06",
    title: "A field guide to ranked feeds",
    url: "https://demo.example/ranked-feeds",
    source: "https://demo.example/feed.xml",
    text: "Ranking a personal reading queue needs term weights, source interest, and recency decay. Show the why or lose the trust. Cold start chronological.",
  },
  {
    id: "demo-07",
    title: "Bun as a build target",
    url: "https://demo.example/bun-compile",
    source: "https://demo.example/feed.xml",
    text: "bun build --compile produces a single executable with embedded assets. Native libraries need the libc pinned at build time or the loader fails.",
  },
  {
    id: "demo-08",
    title: "Undo logs and append-only ledgers",
    url: "https://demo.example/append-only",
    source: "https://demo.example/feed.xml",
    text: "Never mutate history. Append a compensating event and derive state by folding. Auditable, debuggable, and trivially time-traveling.",
  },
  {
    id: "demo-09",
    title: "Keyboard-first reading",
    url: "https://demo.example/keyboard-first",
    source: "https://demo.example/feed.xml",
    text: "Moving the hand to the mouse costs more than the click. j and k, enter to open, q to leave. The queue is a stack you skate across.",
  },
  {
    id: "demo-10",
    title: "Cold start problems beyond machine learning",
    url: "https://demo.example/cold-start",
    source: "https://demo.example/feed.xml",
    text: "Every recommender starts useless. Show chronological order, ask for explicit signal, and tell the user how many ratings remain until ranking goes live.",
  },
  {
    id: "demo-11",
    title: "Receipts: explaining your own ranking",
    url: "https://demo.example/why-receipts",
    source: "https://demo.example/feed.xml",
    text: "A ranking without a receipt is a magic trick. One line per row, expandable fragments, term weights and counts visible on demand.",
  },
  {
    id: "demo-12",
    title: "Single-binary apps are underrated",
    url: "https://demo.example/single-binary",
    source: "https://demo.example/feed.xml",
    text: "One file, no runtime, no install script. Compilation size is the tax. Users forgive megabytes when npm install is not involved.",
  },
];

export function demoSeed(nowMs: number): Story[] {
  return SEEDS.map((s, i) => ({
    id: s.id,
    url: s.url,
    title: s.title,
    source: s.source,
    addedAt: nowMs - (SEEDS.length - i) * 60_000,
    readMs: 0,
    text: s.text,
    topic: "demo",
    saved: false,
    dismissed: false,
  }));
}
