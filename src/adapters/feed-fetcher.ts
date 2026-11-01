// RSS/Atom fetcher — contract in src/md/adapters/feed-fetcher.md. Stub.
import type { FeedFetcher } from "../domain/ports";

export const feedFetcher: FeedFetcher = {
  async fetchFeed() {
    return { ok: false as const, error: "not implemented" };
  },
};
