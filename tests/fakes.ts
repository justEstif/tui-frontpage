// Fake Store/Clock for ranker tests — see src/md/adapters/clock.md.
import type { Clock, LedgerEvent, Source, Story, Store } from "../domain/ports";

export function fakeClock(startMs = 1_000_000): Clock & { set: (ms: number) => void } {
  let now = startMs;
  return { now: () => now, set: (ms: number) => (now = ms) };
}

function storyApi(stories: Story[]): Pick<Store, "addStory" | "updateStory"> {
  return {
    async addStory(s) {
      const story: Story = { ...s, id: s.id ?? `id-${stories.length + 1}` };
      stories.push(story);
      return story;
    },
    async updateStory(id, patch) {
      const i = stories.findIndex((s) => s.id === id);
      if (i >= 0) stories[i] = { ...stories[i], ...patch };
    },
  };
}

function sourceApi(sources: Source[]): Pick<Store, "addSource" | "updateSource"> {
  return {
    async addSource(url, title) {
      const src: Source = {
        url,
        title,
        addedAt: 0,
        pollHours: 2,
        lastPollMs: 0,
        kept: 0,
        skipped: 0,
      };
      sources.push(src);
      return src;
    },
    async updateSource(url, patch) {
      const i = sources.findIndex((s) => s.url === url);
      if (i >= 0) sources[i] = { ...sources[i], ...patch };
    },
  };
}

export function fakeStore(opts?: {
  stories?: Story[];
  sources?: Source[];
  events?: LedgerEvent[];
}): Store {
  const state = {
    stories: [...(opts?.stories ?? [])],
    sources: [...(opts?.sources ?? [])],
    events: [...(opts?.events ?? [])],
  };
  return {
    async init() {},
    async stories() {
      return state.stories.filter((s) => !s.dismissed);
    },
    async story(id) {
      return state.stories.find((s) => s.id === id) ?? null;
    },
    ...storyApi(state.stories),
    ...sourceApi(state.sources),
    async appendEvent(e) {
      state.events.push(e);
    },
    async events() {
      return state.events;
    },
    dbPath: () => ":memory:",
  };
}

export function makeStory(p: Partial<Story> & { id: string }): Story {
  return {
    url: `https://example.com/${p.id}`,
    title: p.id,
    source: null,
    addedAt: 0,
    readMs: 0,
    text: null,
    topic: null,
    saved: false,
    dismissed: false,
    ...p,
  };
}
