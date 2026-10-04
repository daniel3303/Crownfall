import { useEffect, useRef, useState } from "react";
import { currentStep, stepsDone, TUTORIAL_STEPS } from "../../meta/tutorial";
import { metaStore } from "../meta/meta-store";
import { useTutorialCounters } from "./tutorial-tracker";

/** The guided objectives of the tutorial match; each step ticks off from what actually happens in the game. */
export function TutorialOverlay() {
  const counters = useTutorialCounters();
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [closed, setClosed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const reported = useRef(false);
  const index = currentStep(counters, skipped);
  const done = stepsDone(counters);
  const finished = index < 0;
  const earned = done === TUTORIAL_STEPS.length;

  useEffect(() => {
    if (!earned || reported.current) return;
    reported.current = true;
    metaStore.completeTutorial();
  }, [earned]);

  if (closed) return null;
  const step = finished ? null : TUTORIAL_STEPS[index]!;
  return (
    <aside className="tutorial panel" aria-live="polite">
      <header className="tutorial-head">
        <strong>
          Tutorial · {done}/{TUTORIAL_STEPS.length}
        </strong>
        <button className="btn btn-small" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>
          {collapsed ? "Show" : "Hide"}
        </button>
      </header>
      <div className="meta-bar" role="progressbar" aria-valuemin={0} aria-valuemax={TUTORIAL_STEPS.length} aria-valuenow={done}>
        <span style={{ width: `${(done / TUTORIAL_STEPS.length) * 100}%` }} />
      </div>
      {!collapsed && (
        <>
          {step ? (
            <div className="tutorial-step">
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ) : (
            <div className="tutorial-step">
              <h3>{earned ? "Training complete!" : "Tutorial over"}</h3>
              <p>Destroy the enemy town center and villagers to win the match, or return to the menu with Leave.</p>
            </div>
          )}
          <ol className="tutorial-steps">
            {TUTORIAL_STEPS.map((s, i) => {
              const state = s.done(counters) ? "done" : skipped.has(s.id) ? "skipped" : i === index ? "current" : "todo";
              return (
                <li key={s.id} className={`tutorial-${state}`}>
                  {s.title}
                </li>
              );
            })}
          </ol>
          <div className="tutorial-actions">
            {step && (
              <button className="btn btn-small" onClick={() => setSkipped(new Set([...skipped, step.id]))}>
                Skip step
              </button>
            )}
            <button className="btn btn-small" onClick={() => setClosed(true)}>
              {finished ? "Close" : "End tutorial"}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
