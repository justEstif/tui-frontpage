// RSS/Atom fetcher — contract in src/md/adapters/feed-fetcher.md.
// Plain fetch + linkedom parse; robots.txt respected; never throws across
// the port boundary.
import { parseHTML } from "linkedom";
import type { FeedFetcher } from "../domain/ports";
import { allowed, USER_AGENT } from "./robots";

const MAX_ITEMS = 50;

async function get(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
}

function absolute(base: string, href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function elText(el: Element | null | undefined): string {
  return el?.textContent?.trim() ?? "";
}

function itemOf(el: Element, feedUrl: string): Item | null {
  const url = absolute(feedUrl, elText(el.querySelector("link")) || el.getAttribute("href"));
  if (!url) return null;
  return { url, title: elText(el.querySelector("title")) || url };
}

function parseFeed(doc: Document, feedUrl: string): { title: string; items: Item[] } {
  const isRss = doc.querySelector("rss") !== null || doc.querySelector("channel") !== null;
  const rootSel = isRss ? "channel" : "feed";
  const itemSel = isRss ? "item" : "entry";
  const title = elText(doc.querySelector(`${rootSel} > title`)) || feedUrl;
  const items: Item[] = [];
  for (const el of doc.querySelectorAll(itemSel)) {
    const item = isRss ? itemOf(el, feedUrl) : atomItemOf(el, feedUrl);
    if (item) items.push(item);
  }
  return { title, items };
}

function atomItemOf(entry: Element, feedUrl: string): Item | null {
  let href: string | null = null;
  for (const link of entry.querySelectorAll("link")) {
    const rel = link.getAttribute("rel");
    if (rel === "alternate") {
      href = link.getAttribute("href");
      break;
    }
    if (rel === null && href === null) href = link.getAttribute("href");
  }
  const url = absolute(feedUrl, href);
  if (!url) return null;
  return { url, title: elText(entry.querySelector("title")) || url };
}

export const feedFetcher: FeedFetcher = {
  async fetchFeed(feedUrl) {
    try {
      const u = new URL(feedUrl);
      if (!(await allowed(u.origin, u.pathname + u.search))) {
        return { ok: false as const, error: "disallowed by robots.txt" };
      }
      const res = await get(feedUrl);
      if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
      const body = await res.text();
      const doc = parseHTML(body).document;
      const { title, items } = parseFeed(doc, feedUrl);
      if (items.length === 0 && title === feedUrl) {
        return { ok: false as const, error: "unparseable feed body" };
      }
      return { ok: true as const, title, items: items.slice(0, MAX_ITEMS) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  },
};
