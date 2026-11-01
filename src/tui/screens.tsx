// Screen components — contract in src/md/tui/app.md (Screens + Layout).
import type { RankedStory } from "../domain/ranker";
import type { OnboardTick } from "./onboarding";

export function age(movedAtMs: number, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - movedAtMs) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function marker(r: RankedStory): string {
  if (r.story.saved) return "S";
  if (r.story.dismissed) return "x";
  return " ";
}

export function QueueList(props: {
  queue: RankedStory[];
  sel: number;
  nowMs: number;
  width: number;
}) {
  const railW = props.width < 80 ? props.width - 2 : 40;
  return (
    <box style={{ flexDirection: "column" }} title="queue">
      {props.queue.map((r, i) => {
        const cur = i === props.sel;
        return (
          <text
            key={r.story.id}
            fg={cur ? "#101010" : r.story.saved ? "#66CCFF" : "#CCCCCC"}
            bg={cur ? "#00FF88" : undefined}
          >
            {`${marker(r)} ${age(r.story.addedAt, props.nowMs).padEnd(4)} ${trunc(
              r.story.title,
              railW - 10,
            )}${cur ? " ◄" : ""}`}
          </text>
        );
      })}
      {props.queue.length === 0 ? <text>queue empty — press c to capture a URL</text> : null}
    </box>
  );
}

export function ReaderPane(props: { story: RankedStory; nowMs: number }) {
  const s = props.story;
  return (
    <box style={{ flexDirection: "column", padding: 1 }} title="reader">
      <text fg="#00FF88">{s.story.title}</text>
      <text fg="#888888">
        {`${s.story.source ?? "no source"} · ${age(s.story.addedAt, props.nowMs)} · why: ${s.receipt}`}
      </text>
      <box style={{ flexDirection: "column", marginTop: 1 }}>
        {(s.story.text ?? "(no text extracted yet — the daemon will fill this in)")
          .split("\n")
          .slice(0, 60)
          .map((line, i) => (
            <text key={i}>{line}</text>
          ))}
      </box>
      <text fg="#FFFF00">{"m read · f + · h - · u undo · w why · q close"}</text>
    </box>
  );
}

export function WhyPanel(props: { story: RankedStory; score: number }) {
  return (
    <box style={{ border: true, flexDirection: "column", padding: 1 }} title="why this ranking">
      <text>{`score: ${props.score.toFixed(2)}`}</text>
      <text>{props.story.receipt}</text>
      <text fg="#888888">{"u undoes the last action on this story; f/h cycle ±1 → ±2 → off"}</text>
    </box>
  );
}

export function Onboarding(props: {
  tick: OnboardTick;
  rated: number;
  queue: RankedStory[];
  sel: number;
}) {
  if (props.tick.phase === "reorder") {
    return (
      <box style={{ flexDirection: "column", padding: 1 }} title="reorder">
        <text fg="#FFFF00">{"before your ratings (chronological):"}</text>
        {props.tick.before.slice(0, 8).map((t, i) => (
          <text key={`b${i}`}>{`  ${i + 1}. ${t}`}</text>
        ))}
        <text fg="#00FF88">{"after your ratings (ranked):"}</text>
        {props.tick.after.slice(0, 8).map((t, i) => (
          <text key={`a${i}`}>{`  ${i + 1}. ${t}`}</text>
        ))}
      </box>
    );
  }
  return (
    <box style={{ flexDirection: "column", padding: 1 }} title="onboarding">
      <text fg="#00FF88">{`rate ${5 - Math.min(5, props.rated)} more stories to teach frontpage (f = like, h = dislike, j/k = move)`}</text>
      <text fg="#888888">{"esc skips — the queue stays chronological until ranking warms up"}</text>
      <QueueList queue={props.queue} sel={props.sel} nowMs={Date.now()} width={100} />
    </box>
  );
}

function trunc(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`;
}
