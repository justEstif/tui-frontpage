// Story actions over the ports — the controller's hands. No React here.
import type { Clock, LedgerEvent, Store, Story } from "../domain/ports";
import type { RankedStory } from "../domain/ranker";

export type UndoMemo = {
  storyId: string;
  restore: Partial<Story>;
  compensate: LedgerEvent;
};

export function setUndo(
  ref: { current: UndoMemo | null },
  o: { story: Story; restore: Partial<Story>; counterKind: "keep" | "skip"; now: number },
): void {
  const { story, restore, counterKind, now } = o;
  ref.current = {
    storyId: story.id,
    restore,
    compensate: { ts: now, kind: counterKind, storyId: story.id, target: story.title },
  };
}

/** forward: off → +1 → +2 → off; against: off → -1 → -2 → off. */
export function cycleRating(map: Map<string, number>, id: string, delta: number): number {
  const prev = map.get(id) ?? 0;
  const next =
    delta > 0
      ? prev > 0 && prev < 2
        ? prev + 1
        : prev > 0
          ? 0
          : 1
      : prev < 0 && prev > -2
        ? prev - 1
        : prev < 0
          ? 0
          : -1;
  map.set(id, next);
  return next;
}

async function ledger(
  store: Store,
  clock: Clock,
  kind: "keep" | "skip",
  story: Story,
): Promise<void> {
  await store.appendEvent({ ts: clock.now(), kind, storyId: story.id, target: story.title });
}

export async function doSave(
  store: Store,
  clock: Clock,
  cur: RankedStory,
  undo: { current: UndoMemo | null },
): Promise<void> {
  await store.updateStory(cur.story.id, { saved: true });
  await ledger(store, clock, "keep", cur.story);
  await bumpSource(store, cur.story.source, 1);
  setUndo(undo, {
    story: cur.story,
    restore: { saved: false },
    counterKind: "skip",
    now: clock.now(),
  });
}

export async function doSkip(
  store: Store,
  clock: Clock,
  cur: RankedStory,
  undo: { current: UndoMemo | null },
): Promise<void> {
  await store.updateStory(cur.story.id, { dismissed: true });
  await ledger(store, clock, "skip", cur.story);
  await bumpSource(store, cur.story.source, -1);
  setUndo(undo, {
    story: cur.story,
    restore: { dismissed: false },
    counterKind: "keep",
    now: clock.now(),
  });
}

export async function doMarkRead(
  store: Store,
  clock: Clock,
  cur: RankedStory,
  ms: number,
): Promise<void> {
  await store.updateStory(cur.story.id, { readMs: ms, dismissed: true });
  await store.appendEvent({
    ts: clock.now(),
    kind: "read",
    storyId: cur.story.id,
    target: String(ms),
  });
}

export async function doRate(
  store: Store,
  clock: Clock,
  o: { cur: RankedStory; next: number; undo: { current: UndoMemo | null } },
): Promise<void> {
  const { cur, next, undo } = o;
  await store.appendEvent({
    ts: clock.now(),
    kind: "rate",
    storyId: cur.story.id,
    target: String(next),
  });
  undo.current = {
    storyId: cur.story.id,
    restore: {},
    compensate: { ts: clock.now(), kind: "rate", storyId: cur.story.id, target: String(-next) },
  };
}

export async function doUndo(store: Store, undo: { current: UndoMemo | null }): Promise<void> {
  const u = undo.current;
  if (u === null) return;
  await store.updateStory(u.storyId, u.restore);
  await store.appendEvent(u.compensate);
  undo.current = null;
}

async function bumpSource(store: Store, source: string | null, d: number): Promise<void> {
  if (source === null) return;
  const src = (await store.sources()).find((s) => s.url === source);
  if (!src) return;
  await store.updateSource(source, d > 0 ? { kept: src.kept + 1 } : { skipped: src.skipped + 1 });
}
