// Capture logic — contract in src/md/tui/app.md.
// `c` opens the input; submit: feed URL → new source, otherwise new story
// (extraction happens in the daemon).
import type { Clock, Store } from "../domain/ports";

const FEED_HINTS = ["/feed", "/rss", "/atom", "feeds."];

/** Heuristic: does this URL look like an RSS/Atom feed rather than a page? */
export function isFeedUrl(url: string): boolean {
  const u = url.toLowerCase();
  if (/\.(xml|rss|atom)([?#]|$)/.test(u)) return true;
  return FEED_HINTS.some((h) => u.includes(h));
}

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const url = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes(".") ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export type CaptureOutcome =
  | { kind: "source"; title: string }
  | { kind: "story" }
  | { kind: "invalid"; reason: string };

/** Apply one captured input to the store. Returns what happened (for the toast). */
export async function applyCapture(
  store: Store,
  clock: Clock,
  raw: string,
): Promise<CaptureOutcome> {
  const url = normalizeUrl(raw);
  if (url === null) return { kind: "invalid", reason: "not a URL" };
  const now = clock.now();
  if (isFeedUrl(url)) {
    const src = await store.addSource(url, url);
    return { kind: "source", title: src.title };
  }
  const title = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  await store.addStory({
    url,
    title,
    source: null,
    addedAt: now,
    readMs: 0,
    text: null,
    topic: null,
    saved: false,
    dismissed: false,
  });
  await store.appendEvent({ ts: now, kind: "capture", storyId: null, target: url });
  return { kind: "story" };
}
