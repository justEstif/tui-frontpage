// Controller: plain state machine over the Store + ranker ports (no React).
// The React layer subscribes and renders; see src/md/tui/app.md.
import type { Clock, LedgerEvent, Store } from "../domain/ports";
import type { RankedStory } from "../domain/ranker";
import { coldStartNotice, rankQueue } from "../domain/ranker";
import { applyCapture } from "./capture";
import { mapKey, type Action, type KeyInput, type Screen } from "./keys";
import {
  doneEvent,
  isOnboardingDone,
  needsOnboarding,
  onboardTick,
  ONBOARD_RATINGS,
  type OnboardTick,
} from "./onboarding";
import { cycleRating, doMarkRead, doRate, doSave, doSkip, doUndo, type UndoMemo } from "./actions";
import { daemonRunning, readPid } from "../adapters/scheduler";
import { lastPollLabel } from "./status";

export type AppState = {
  screen: Screen;
  queue: RankedStory[];
  sel: number;
  readerId: string | null;
  whyFull: boolean;
  toast: string | null;
  tick: OnboardTick | null;
  captureText: string;
  daemon: string;
  coldNotice: string | null;
  lastPoll: string | null;
};

const INITIAL: AppState = {
  screen: "queue",
  queue: [],
  sel: 0,
  readerId: null,
  whyFull: false,
  toast: null,
  tick: null,
  captureText: "",
  daemon: "daemon down",
  coldNotice: null,
  lastPoll: null,
};

export class Controller {
  state: AppState = INITIAL;
  private listeners = new Set<() => void>();
  private undo: { current: UndoMemo | null } = { current: null };
  private ratings = new Map<string, number>();
  private readStart = 0;

  constructor(
    private readonly store: Store,
    private readonly clock: Clock,
    private readonly quit: () => void,
  ) {}

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getState = (): AppState => this.state;

  private set(p: Partial<AppState>): void {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }

  private selected(): RankedStory | null {
    return this.state.queue[this.state.sel] ?? null;
  }

  private async load(): Promise<{
    ranked: RankedStory[];
    events: LedgerEvent[];
    lastPollMs: number;
  }> {
    const [stories, events, sources] = await Promise.all([
      this.store.stories(),
      this.store.events(),
      this.store.sources(),
    ]);
    const ranked = rankQueue(stories, events, sources, this.clock);
    const lastPollMs = sources.reduce((m, s) => Math.max(m, s.lastPollMs), 0);
    return { ranked, events, lastPollMs };
  }

  async refresh(): Promise<void> {
    const { ranked, events, lastPollMs } = await this.load();
    const pid = readPid();
    this.set({
      queue: ranked,
      sel: Math.min(this.state.sel, Math.max(0, ranked.length - 1)),
      coldNotice: coldStartNotice(events),
      lastPoll: lastPollLabel(lastPollMs, this.clock.now()),
      daemon: pid !== null && (await daemonRunning()) ? `daemon pid ${pid}` : "daemon down",
    });
  }

  private async flash(msg: string): Promise<void> {
    this.set({ toast: msg });
    await this.refresh();
  }

  async boot(): Promise<void> {
    const [stories, events] = await Promise.all([this.store.stories(), this.store.events()]);
    if (needsOnboarding(stories, events)) {
      const { demoSeed } = await import("./demo");
      for (const st of demoSeed(this.clock.now())) await this.store.addStory(st);
      await this.refresh();
      this.set({ screen: "onboarding", tick: { phase: "rate", rated: 0 } });
      return;
    }
    await this.refresh();
  }

  private async onboardRate(): Promise<void> {
    const tick = this.state.tick;
    if (tick === null || tick.phase !== "rate") return;
    const rated = tick.rated + 1;
    this.set({ tick: { phase: "rate", rated } });
    if (rated < ONBOARD_RATINGS || isOnboardingDone(await this.store.events())) return;
    const before = this.state.queue.map((r) => r.story.title);
    await this.store.appendEvent(doneEvent(this.clock.now()));
    const { ranked } = await this.load();
    this.set({
      tick: onboardTick(tick, {
        type: "show-reorder",
        before,
        after: ranked.map((r) => r.story.title),
      }),
    });
    setTimeout(() => this.set({ tick: { phase: "done" }, screen: "queue" }), 3000);
  }

  private async rate(delta: number): Promise<void> {
    const cur = this.selected();
    if (cur === null) return;
    const next = cycleRating(this.ratings, cur.story.id, delta);
    await doRate(this.store, this.clock, { cur, next, undo: this.undo });
    await this.flash(`${cur.story.title} rated ${next > 0 ? "+" : ""}${next}`);
    await this.onboardRate();
  }

  async submitCapture(raw: string): Promise<void> {
    const out = await applyCapture(this.store, this.clock, raw);
    const msg =
      out.kind === "invalid"
        ? `capture failed: ${out.reason}`
        : out.kind === "source"
          ? "source added"
          : "story saved";
    this.set({ screen: "queue", toast: msg });
    await this.refresh();
  }

  onKey = (key: KeyInput): void => {
    void this.dispatch(key);
  };

  private async dispatch(key: KeyInput): Promise<void> {
    if (this.state.screen === "capture") {
      if (key.name === "escape") await this.run("cancel"); // enter handled by <input>
      return;
    }
    await this.run(mapKey(key, this.state.screen));
  }

  private async run(action: Action): Promise<void> {
    if (action === "quit") return this.quit();
    if (action === "move-down") {
      this.set({ sel: Math.min(this.state.sel + 1, Math.max(0, this.state.queue.length - 1)) });
      return;
    }
    if (action === "move-up") {
      this.set({ sel: Math.max(this.state.sel - 1, 0) });
      return;
    }
    await this.runNav(action);
  }

  private async runNav(action: Action): Promise<void> {
    if (action === "open") return this.openSelected();
    if (action === "close-reader")
      return this.set({ screen: "queue", readerId: null, whyFull: false });
    if (action === "why") return this.set({ whyFull: !this.state.whyFull });
    if (action === "capture") return this.set({ screen: "capture", captureText: "" });
    if (action === "cancel") return this.cancel();
    await this.runEffect(action);
  }

  /** Leave capture or onboarding; skipped onboarding is marked done (never re-runs). */
  private async cancel(): Promise<void> {
    if (this.state.screen === "onboarding" && !isOnboardingDone(await this.store.events())) {
      await this.store.appendEvent(doneEvent(this.clock.now()));
    }
    this.set({ screen: "queue" });
  }

  private openSelected(): void {
    const cur = this.selected();
    if (cur === null) return;
    this.readStart = this.clock.now();
    this.set({ screen: "reader", readerId: cur.story.id, whyFull: false });
  }

  private async runEffect(action: Action): Promise<void> {
    if (action === "skip") return this.effectSelected("skip");
    if (action === "save") return this.effectSelected("save");
    if (action === "mark-read") return this.markRead();
    if (action === "rate-forward") return this.rate(1);
    if (action === "rate-against") return this.rate(-1);
    if (action === "undo") await this.undoLast();
  }

  private async effectSelected(kind: "skip" | "save"): Promise<void> {
    const cur = this.selected();
    if (cur === null) return;
    if (kind === "skip") {
      await doSkip(this.store, this.clock, cur, this.undo);
      await this.flash("dismissed");
    } else {
      await doSave(this.store, this.clock, cur, this.undo);
      await this.flash("saved for later");
    }
  }

  private async markRead(): Promise<void> {
    const s = this.state;
    const cur = s.queue.find((r) => r.story.id === s.readerId) ?? this.selected();
    if (cur === null) return;
    const ms = s.screen === "reader" ? this.clock.now() - this.readStart : 0;
    await doMarkRead(this.store, this.clock, cur, ms);
    this.set({ screen: "queue", readerId: null, whyFull: false });
    await this.flash("marked read");
  }

  private async undoLast(): Promise<void> {
    const had = this.undo.current !== null;
    await doUndo(this.store, this.undo);
    await this.flash(had ? "undone" : "nothing to undo");
  }
}
