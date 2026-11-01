import { describe, expect, test } from "bun:test";
import { feedFetcher } from "../src/adapters/feed-fetcher";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example Blog</title>
  <item><title>Post One</title><link>https://example.com/1</link></item>
  <item><title>Post Two</title><link>https://example.com/2</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry><title>Entry One</title><link rel="alternate" href="https://example.com/a/1"/></entry>
  <entry><title>Entry Two</title><link href="https://example.com/a/2"/></entry>
</feed>`;

function serveFor(
  robots: { body: string | null; status?: number },
  feedBody: string,
  feedStatus = 200,
) {
  const seen: string[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const path = new URL(req.url).pathname;
      seen.push(path);
      if (path === "/robots.txt") {
        if (robots.body === null) return new Response("gone", { status: 404 });
        return new Response(robots.body, { status: robots.status ?? 200 });
      }
      return new Response(feedBody, { status: feedStatus });
    },
  });
  return { server, seen, base: `http://localhost:${server.port}` };
}

const RSS_ITEMS = [
  { url: "https://example.com/1", title: "Post One" },
  { url: "https://example.com/2", title: "Post Two" },
];

describe("feedFetcher", () => {
  test("parses RSS 2.0", async () => {
    const { server, base } = serveFor({ body: null }, RSS);
    const result = await feedFetcher.fetchFeed(`${base}/rss.xml`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.title).toBe("Example Blog");
      expect(result.items).toEqual(RSS_ITEMS);
    }
    server.stop(true);
  });

  test("parses Atom", async () => {
    const { server, base } = serveFor({ body: null }, ATOM);
    const result = await feedFetcher.fetchFeed(`${base}/atom.xml`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.title).toBe("Atom Feed");
      expect(result.items.map((i) => i.url)).toEqual([
        "https://example.com/a/1",
        "https://example.com/a/2",
      ]);
    }
    server.stop(true);
  });

  test("robots-disallowed path", async () => {
    const { server, base } = serveFor({ body: "User-agent: *\nDisallow: /private/" }, RSS);
    const result = await feedFetcher.fetchFeed(`${base}/private/rss.xml`);
    expect(result).toEqual({ ok: false, error: "disallowed by robots.txt" });
    server.stop(true);
  });

  test("missing robots.txt (404) means allowed", async () => {
    const { server, base, seen } = serveFor({ body: null }, RSS);
    const result = await feedFetcher.fetchFeed(`${base}/rss.xml`);
    expect(result.ok).toBe(true);
    expect(seen).toContain("/robots.txt");
    server.stop(true);
  });

  test("robots 5xx is conservative", async () => {
    const { server, base } = serveFor({ body: "oops", status: 503 }, RSS);
    const result = await feedFetcher.fetchFeed(`${base}/rss.xml`);
    expect(result).toEqual({ ok: false, error: "disallowed by robots.txt" });
    server.stop(true);
  });

  test("non-2xx feed is an error result", async () => {
    const { server, base } = serveFor({ body: null }, RSS, 500);
    const result = await feedFetcher.fetchFeed(`${base}/rss.xml`);
    expect(result).toEqual({ ok: false, error: "HTTP 500" });
    server.stop(true);
  });

  test("malformed XML is an error result", async () => {
    const { server, base } = serveFor(
      { body: null },
      "<html><body>this is not a feed</body></html>",
    );
    const result = await feedFetcher.fetchFeed(`${base}/rss.xml`);
    expect(result.ok).toBe(false);
    server.stop(true);
  });
});
