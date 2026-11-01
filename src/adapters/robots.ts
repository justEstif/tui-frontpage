// Shared robots.txt respect for feed-fetcher and extractor — contract in
// src/md/adapters/feed-fetcher.md. Per-host cache, 1 hour TTL.
const TTL_MS = 3600_000;
const UA = "frontpage/0.1 (+https://github.com/justEstif/tui-frontpage)";

export { UA as USER_AGENT };

type CacheEntry = { paths: string[] | null; fetchedAt: number }; // null = no robots file

const cache = new Map<string, CacheEntry>();

function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(10_000),
  });
}

/**
 * True when `path` (pathname + search) may be fetched on `origin`.
 * 404/410 robots → allowed. Other 4xx/5xx → conservative (disallowed).
 */
export async function allowed(origin: string, path: string): Promise<boolean> {
  const now = Date.now();
  const hit = cache.get(origin);
  let entry: CacheEntry;
  if (hit && now - hit.fetchedAt < TTL_MS) {
    entry = hit;
  } else {
    let paths: string[] | null;
    try {
      const res = await fetchWithTimeout(`${origin}/robots.txt`);
      if (res.status === 404 || res.status === 410) {
        paths = null;
      } else if (!res.ok) {
        paths = ["*"]; // conservative: disallow everything
      } else {
        paths = parseRobots(await res.text());
      }
    } catch {
      paths = ["*"]; // network failure on robots: be conservative
    }
    entry = { paths, fetchedAt: now };
    cache.set(origin, entry);
  }
  if (entry.paths === null) return true;
  return !entry.paths.some((p) => p !== "" && path.startsWith(p));
}

/** Extract the `User-agent: *` group's Disallow paths. Empty array = allow all. */
export function parseRobots(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const paths: string[] = [];
  let inStar = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      inStar = value === "*";
    } else if (key === "disallow" && inStar) {
      if (value !== "") paths.push(value);
    }
  }
  return paths;
}
