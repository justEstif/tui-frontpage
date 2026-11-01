// Onboarding state machine — contract in src/md/tui/app.md.
// Fresh store (no stories, no events) → seed demo data, prompt to rate 5,
// show the reorder, then never again (ledger sentinel event).
import type { LedgerEvent, Story } from "../domain/ports";
import { demoSeed } from "./demo";

export const ONBOARD_DONE_TARGET = "onboarding-done";
export const ONBOARD_RATINGS = 5;

export function isOnboardingDone(events: LedgerEvent[]): boolean {
  return events.some((e) => e.target === ONBOARD_DONE_TARGET);
}

export function doneEvent(nowMs: number): LedgerEvent {
  return { ts: nowMs, kind: "capture", storyId: null, target: ONBOARD_DONE_TARGET };
}

/** True when the store is untouched: no user events, no stories. */
export function needsOnboarding(stories: Story[], events: LedgerEvent[]): boolean {
  return stories.length === 0 && events.length === 0;
}

/** Seed result: stories to add plus the onboarding tick state. */
export function seedResult(nowMs: number): { stories: Story[]; tick: OnboardTick } {
  return { stories: demoSeed(nowMs), tick: { phase: "rate", rated: 0 } };
}

export type OnboardTick =
  | { phase: "rate"; rated: number }
  | { phase: "reorder"; before: string[]; after: string[] }
  | { phase: "done" };

export type OnboardAction =
  | { type: "rate" }
  | { type: "skip-all" }
  | { type: "show-reorder"; before: string[]; after: string[] }
  | { type: "finish" };

/**
 * Pure tick reducer. `rate` advances toward ONBOARD_RATINGS; the 5th rating
 * moves to "reorder" (caller supplies before/after title orders); `finish`
 * (or the reorder timer) ends onboarding.
 */
export function onboardTick(tick: OnboardTick, action: OnboardAction): OnboardTick {
  switch (action.type) {
    case "rate":
      return tick.phase !== "rate" ? tick : { phase: "rate", rated: tick.rated + 1 };
    case "skip-all":
    case "finish":
      return { phase: "done" };
    case "show-reorder":
      return tick.phase === "rate"
        ? { phase: "reorder", before: action.before, after: action.after }
        : tick;
  }
}

export function onboardFinished(tick: OnboardTick): boolean {
  return tick.phase === "done";
}
