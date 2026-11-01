// App shell — contract in src/md/tui/app.md (Screens, Layout, Keys).
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useKeyboard } from "@opentui/react";
import { openStore } from "../adapters/sqlite-store";
import { systemClock } from "../adapters/clock";
import { Controller, type AppState } from "./controller";
import { Onboarding, QueueList, ReaderPane, WhyPanel } from "./screens";
import { CaptureInput, StatusLine } from "./status";

export function App() {
  const controller = useMemo(
    () => new Controller(openStore(), systemClock, () => process.exit(0)),
    [],
  );
  const s = useSyncExternalStore(controller.subscribe, controller.getState);
  useKeyboard((key) => controller.onKey(key));
  useEffect(() => {
    void controller.boot();
    const t = setInterval(() => void controller.refresh(), 5000);
    return () => clearInterval(t);
  }, [controller]);

  const status = (
    <StatusLine
      daemon={s.daemon}
      queueCount={s.queue.length}
      coldNotice={s.coldNotice}
      lastPoll={s.lastPoll}
    />
  );

  if (s.screen === "capture") {
    return (
      <box style={{ flexDirection: "column" }}>
        <CaptureInput
          onSubmit={(v) => void controller.submitCapture(v)}
          onCancel={() => controller.onKey({ name: "escape" })}
        />
        {status}
      </box>
    );
  }
  if (s.screen === "onboarding" && s.tick !== null) {
    return <OnboardView tick={s.tick} queue={s.queue} sel={s.sel} status={status} />;
  }
  return <MainView s={s} status={status} />;
}

function OnboardView(props: {
  tick: AppState["tick"];
  queue: AppState["queue"];
  sel: number;
  status: React.ReactNode;
}) {
  const tick = props.tick;
  if (tick === null) return <box />;
  return (
    <box style={{ flexDirection: "column" }}>
      <Onboarding
        tick={tick}
        rated={tick.phase === "rate" ? tick.rated : 0}
        queue={props.queue}
        sel={props.sel}
      />
      {props.status}
    </box>
  );
}

function MainView(props: { s: AppState; status: React.ReactNode }) {
  const { s, status } = props;
  const reader =
    s.readerId === null ? null : (s.queue.find((r) => r.story.id === s.readerId) ?? null);
  return (
    <box style={{ flexDirection: "column" }}>
      <box style={{ flexDirection: "row" }} flexGrow={1}>
        <QueueList queue={s.queue} sel={s.sel} nowMs={Date.now()} width={40} />
        {reader !== null ? (
          <box style={{ flexDirection: "column" }} flexGrow={1}>
            <ReaderPane story={reader} nowMs={Date.now()} />
            {s.whyFull ? <WhyPanel story={reader} score={reader.score} /> : null}
          </box>
        ) : null}
      </box>
      {s.toast !== null ? (
        <text fg="#FFFF00">{` ${s.toast} `}</text>
      ) : (
        <text fg="#888888">
          {" j/k move · enter open · x dismiss · S save · c capture · q quit "}
        </text>
      )}
      {status}
    </box>
  );
}
