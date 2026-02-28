"use client";

import { useEffect, useState } from "react";

type MascotId = "cat" | "off";

const STORAGE_KEY = "taskflow.workspace.ambient-mascot";

const OPTIONS: Array<{ id: MascotId; label: string }> = [
  { id: "cat", label: "Cat" },
  { id: "off", label: "Off" },
];

const TIME_FORMATTERS = {
  local: new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }),
  utc: new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  }),
  msk: new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Moscow",
  }),
};

export function WorkspaceAmbientStage() {
  const [active, setActive] = useState<MascotId>("cat");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [roaming, setRoaming] = useState(false);
  const [idleState, setIdleState] = useState<"sit" | "stand" | "look">("sit");

  const catSprite = (
    <>
      <span className="ambient-cat-tail">
        <span className="ambient-cat-tail-tip" />
      </span>
      <span className="ambient-cat-body" />
      <span className="ambient-cat-shadow" />
      <span className="ambient-cat-head" />
      <span className="ambient-cat-ear ambient-cat-ear-left" />
      <span className="ambient-cat-ear ambient-cat-ear-right" />
      <span className="ambient-cat-ear-inner ambient-cat-ear-inner-left" />
      <span className="ambient-cat-ear-inner ambient-cat-ear-inner-right" />
      <span className="ambient-cat-eye ambient-cat-eye-left" />
      <span className="ambient-cat-eye ambient-cat-eye-right" />
      <span className="ambient-cat-eye-shine ambient-cat-eye-shine-left" />
      <span className="ambient-cat-eye-shine ambient-cat-eye-shine-right" />
      <span className="ambient-cat-cheek ambient-cat-cheek-left" />
      <span className="ambient-cat-cheek ambient-cat-cheek-right" />
      <span className="ambient-cat-nose" />
      <span className="ambient-cat-mouth" />
      <span className="ambient-cat-leg ambient-cat-leg-a" />
      <span className="ambient-cat-leg ambient-cat-leg-b" />
      <span className="ambient-cat-leg ambient-cat-leg-c" />
      <span className="ambient-cat-leg ambient-cat-leg-d" />
    </>
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (stored === "cat" || stored === "off") {
      setActive(stored);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, active);
  }, [active]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (active !== "cat") {
      setRoaming(false);
    }
  }, [active]);

  useEffect(() => {
    if (active !== "cat") {
      return;
    }

    const states: Array<"sit" | "stand" | "look"> = ["sit", "stand", "look"];
    let index = 0;

    const timer = window.setInterval(() => {
      index = (index + 1) % states.length;
      const nextState = states[index] ?? "sit";
      setIdleState(nextState);
    }, 3200);

    return () => window.clearInterval(timer);
  }, [active]);

  return (
    <>
      <aside
        className="workspace-ambient-stage"
        aria-label="Ambient mascot stage"
      >
        <div className={`workspace-ambient-shell workspace-ambient-${active}`}>
          <div className="workspace-ambient-glow workspace-ambient-glow-a" />
          <div className="workspace-ambient-glow workspace-ambient-glow-b" />
          <div className="workspace-ambient-spark workspace-ambient-spark-a" />
          <div className="workspace-ambient-spark workspace-ambient-spark-b" />

          <div className="workspace-ambient-scene">
            <div className="workspace-ambient-floor" />
            <div className="workspace-ambient-lamp">
              <span className="workspace-ambient-lamp-head" />
              <span className="workspace-ambient-lamp-stem" />
              <span className="workspace-ambient-lamp-pool" />
            </div>

            <div
              className={`workspace-ambient-figure workspace-ambient-figure-${active}`}
            >
              {active === "cat" ? (
                !roaming ? (
                  <div
                    className={`ambient-cat-dock ambient-cat-dock-${idleState}`}
                  >
                    <button
                      aria-label="Let cat roam"
                      className={`ambient-cat ambient-cat-button ambient-cat-state-${idleState}`}
                      onClick={() => setRoaming(true)}
                      type="button"
                    >
                      {catSprite}
                    </button>
                  </div>
                ) : null
              ) : null}

              {active === "off" ? (
                <div className="ambient-off">
                  <span className="ambient-off-orb" />
                  <div className="ambient-off-clocks">
                    <div className="ambient-off-clock">
                      <span className="ambient-off-zone">Local</span>
                      <strong className="ambient-off-time">
                        {TIME_FORMATTERS.local.format(now)}
                      </strong>
                    </div>
                    <div className="ambient-off-clock">
                      <span className="ambient-off-zone">UTC</span>
                      <strong className="ambient-off-time">
                        {TIME_FORMATTERS.utc.format(now)}
                      </strong>
                    </div>
                    <div className="ambient-off-clock">
                      <span className="ambient-off-zone">MSK</span>
                      <strong className="ambient-off-time">
                        {TIME_FORMATTERS.msk.format(now)}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="workspace-ambient-controls">
            <button
              aria-label="Choose mascot"
              aria-expanded={pickerOpen}
              className="workspace-ambient-toggle"
              onClick={() => setPickerOpen((current) => !current)}
              type="button"
            />

            {pickerOpen ? (
              <div
                className="workspace-ambient-picker"
                role="tablist"
                aria-label="Mascot selector"
              >
                {OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={
                      option.id === active
                        ? "workspace-ambient-chip workspace-ambient-chip-active"
                        : "workspace-ambient-chip"
                    }
                    onClick={() => {
                      setActive(option.id);
                      setPickerOpen(false);
                    }}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      {active === "cat" && roaming ? (
        <button
          aria-label="Return cat to stage"
          className="workspace-roaming-cat"
          onClick={() => setRoaming(false)}
          type="button"
        >
          <span
            className={`workspace-roaming-cat-inner ambient-cat-state-${idleState}`}
          >
            <span className="ambient-cat">{catSprite}</span>
            <span className="workspace-roaming-dust workspace-roaming-dust-a" />
            <span className="workspace-roaming-dust workspace-roaming-dust-b" />
            <span className="workspace-roaming-dust workspace-roaming-dust-c" />
          </span>
        </button>
      ) : null}
    </>
  );
}
