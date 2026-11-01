// Key → action mapping — contract in src/md/tui/app.md (Keys table).
// Pure, table-driven: the controller executes; this only names the action.

export type Screen = "queue" | "reader" | "capture" | "onboarding";

export type KeyInput = { name?: string; sequence?: string; ctrl?: boolean };

export type Action =
  | "move-down"
  | "move-up"
  | "open"
  | "close-reader"
  | "skip"
  | "save"
  | "mark-read"
  | "rate-forward"
  | "rate-against"
  | "undo"
  | "why"
  | "capture"
  | "cancel"
  | "quit"
  | "none";

const QUEUE: Partial<Record<string, Action>> = {
  j: "move-down",
  k: "move-up",
  x: "skip",
  S: "save",
  m: "mark-read",
  f: "rate-forward",
  h: "rate-against",
  u: "undo",
  w: "why",
  c: "capture",
  q: "quit",
};

const READER: Partial<Record<string, Action>> = {
  m: "mark-read",
  f: "rate-forward",
  h: "rate-against",
  u: "undo",
  w: "why",
  q: "close-reader",
};

function keyLabel(key: KeyInput): string | null {
  if (key.ctrl) return null;
  const seq = key.sequence;
  if (seq !== undefined && seq.length === 1) return seq;
  const name = key.name;
  if (name !== undefined && name.length === 1) return name;
  return null;
}

/**
 * Map one key press on one screen to an action.
 * Queue: j/k move, enter open, x dismiss, S save, m read, f/h rate, u undo,
 * w why, c capture, q quit. Reader: h/m/f/u/w, q/esc close. Capture: esc.
 */
export function mapKey(key: KeyInput, screen: Screen): Action {
  // capture is handled by the input component; screen here is queue/reader/onboarding
  if (key.name === "escape") {
    if (screen === "reader") return "close-reader";
    if (screen === "onboarding") return "cancel"; // skippable, queue stays chronological
    return "none";
  }
  if (key.name === "return" || key.name === "enter") {
    return screen === "queue" ? "open" : "none";
  }
  const label = keyLabel(key);
  if (label === null) return "none";
  const table = screen === "reader" ? READER : QUEUE;
  return table[label] ?? "none";
}
