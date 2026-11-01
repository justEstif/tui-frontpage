// Status line + capture input — contract in src/md/tui/app.md.
import { useState } from "react";
import { useKeyboard } from "@opentui/react";

export function StatusLine(props: {
  daemon: string;
  queueCount: number;
  coldNotice: string | null;
  lastPoll: string | null;
}) {
  const warmth = props.coldNotice ?? "ranking live";
  return (
    <box style={{ flexDirection: "row", backgroundColor: "#222222", paddingLeft: 1 }}>
      <text fg="#00FF88">{` ${props.daemon} `}</text>
      <text fg="#CCCCCC">{`· queue ${props.queueCount} `}</text>
      <text fg={props.coldNotice === null ? "#00FF88" : "#FFFF00"}>{`· ${warmth} `}</text>
      <text fg="#888888">
        {props.lastPoll === null ? "· never polled" : `· last poll ${props.lastPoll}`}
      </text>
    </box>
  );
}

export function CaptureInput(props: { onSubmit: (value: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  useKeyboard((key) => {
    if (key.name === "escape") props.onCancel();
    if (key.name === "return" || key.name === "enter") props.onSubmit(value);
    if (key.name === "backspace") setValue((v) => v.slice(0, -1));
    const seq = key.sequence;
    if (seq !== undefined && seq.length === 1 && seq >= " " && seq !== "") {
      setValue((v) => v + seq);
    }
  });
  return (
    <box style={{ border: true, flexDirection: "column", padding: 1 }} title="capture">
      <text fg="#00FF88">{"paste a URL — feeds become sources, pages become stories"}</text>
      <text fg="#CCCCCC">{`> ${value}█`}</text>
      <text fg="#888888">{"enter submit · esc cancel"}</text>
    </box>
  );
}

/** Tracks the last poll time as a human string; the TUI itself never polls. */
export function lastPollLabel(maxLastPollMs: number | null, nowMs: number): string | null {
  if (maxLastPollMs === null || maxLastPollMs === 0) return null;
  const mins = Math.round((nowMs - maxLastPollMs) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}
