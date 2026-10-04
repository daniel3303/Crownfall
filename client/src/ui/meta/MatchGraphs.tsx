import { useState, type PointerEvent } from "react";
import { minuteTicks, nearestSample, yTicks } from "../../meta/chart-scale";
import type { MatchTimeline, PlayerTimeline, PlayerView } from "../../net/protocol";
import { playerColor } from "../palette";

type Metric = "army" | "gathered" | "score";

const METRICS: { id: Metric; label: string }[] = [
  { id: "army", label: "Army size" },
  { id: "gathered", label: "Resources gathered" },
  { id: "score", label: "Score" },
];

const WIDTH = 640;
const HEIGHT = 230;
const LEFT = 46;
const TOP = 10;
const BOTTOM = 24;
/** Room on the right for direct labels; only drawn when few enough lines to label each. */
const LABEL_ROOM = 92;
const MAX_LABELLED = 4;
const LABEL_GAP = 13;
const LABEL_CHARS = 10;

interface Series {
  index: number;
  name: string;
  color: string;
  values: number[];
  mine: boolean;
}

/** Line graphs of each player's army, gathering and score over the match, from the server's sampled timeline. */
export function MatchGraphs({ timeline, roster, you }: { timeline: MatchTimeline; roster: PlayerView[]; you: number }) {
  const [metric, setMetric] = useState<Metric>("army");
  const [hover, setHover] = useState<number | null>(null);
  if (!timeline || timeline.seconds.length < 2) return null;
  const series: Series[] = timeline.players.map((p: PlayerTimeline) => ({
    index: p.index,
    name: roster.find((r) => r.index === p.index)?.name ?? `Player ${p.index + 1}`,
    color: playerColor(roster, p.index),
    values: p[metric],
    mine: p.index === you,
  }));
  const labelled = series.length <= MAX_LABELLED;
  const right = WIDTH - (labelled ? LABEL_ROOM : 12);
  const seconds = timeline.seconds;
  const end = seconds[seconds.length - 1]!;
  const ticks = yTicks(Math.max(1, ...series.flatMap((s) => s.values)));
  const top = ticks[ticks.length - 1]!;
  const x = (t: number) => LEFT + (t / Math.max(1, end)) * (right - LEFT);
  const y = (v: number) => HEIGHT - BOTTOM - (v / top) * (HEIGHT - BOTTOM - TOP);
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"}${x(seconds[i]!).toFixed(1)},${y(v).toFixed(1)}`).join("");

  const onMove = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const at = ((event.clientX - box.left) / box.width) * WIDTH;
    setHover(nearestSample(seconds, ((at - LEFT) / (right - LEFT)) * end));
  };

  return (
    <section className="graphs">
      <div className="graph-tabs" role="tablist">
        {METRICS.map((m) => (
          <button key={m.id} role="tab" aria-selected={metric === m.id} className={`btn btn-small ${metric === m.id ? "active" : ""}`} onClick={() => setMetric(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <ul className="graph-legend">
        {series.map((s) => (
          <li key={s.index} className={s.mine ? "mine" : ""}>
            <span className="line-key" style={{ background: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
      <div className="graph-frame">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${METRICS.find((m) => m.id === metric)!.label} over the match`}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={LEFT} x2={right} y1={y(v)} y2={y(v)} className="graph-grid" />
              <text x={LEFT - 6} y={y(v) + 4} textAnchor="end" className="graph-axis">
                {compact(v)}
              </text>
            </g>
          ))}
          {minuteTicks(end).map((t) => (
            <text key={t} x={x(t)} y={HEIGHT - 6} textAnchor="middle" className="graph-axis">
              {t / 60}m
            </text>
          ))}
          {series.map((s) => (
            <path key={s.index} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.mine ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {labelled && <EndLabels series={series} x={right} y={y} />}
          {hover !== null && (
            <g>
              <line x1={x(seconds[hover]!)} x2={x(seconds[hover]!)} y1={TOP} y2={HEIGHT - BOTTOM} className="graph-crosshair" />
              {series.map((s) => (
                <circle key={s.index} cx={x(seconds[hover]!)} cy={y(s.values[hover] ?? 0)} r={4} fill={s.color} className="graph-dot" />
              ))}
            </g>
          )}
          <rect x={LEFT} y={TOP} width={right - LEFT} height={HEIGHT - BOTTOM - TOP} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover !== null && <Readout series={series} at={hover} seconds={seconds[hover]!} left={(x(seconds[hover]!) / WIDTH) * 100} />}
      </div>
      <details className="graph-table">
        <summary>View as table</summary>
        <DataTable series={series} seconds={seconds} />
      </details>
    </section>
  );
}

/** Each line's name at its last point, nudged apart so labels never overlap. */
function EndLabels({ series, x, y }: { series: Series[]; x: number; y: (v: number) => number }) {
  const placed = series
    .map((s) => ({ s, at: y(s.values[s.values.length - 1] ?? 0) }))
    .sort((a, b) => a.at - b.at);
  for (let i = 1; i < placed.length; i++) placed[i]!.at = Math.max(placed[i]!.at, placed[i - 1]!.at + LABEL_GAP);
  return (
    <g>
      {placed.map(({ s, at }) => (
        <g key={s.index}>
          <line x1={x + 6} x2={x + 16} y1={at} y2={at} stroke={s.color} strokeWidth={2} strokeLinecap="round" />
          <text x={x + 20} y={at + 4} className={`graph-label ${s.mine ? "mine" : ""}`}>
            {endLabel(s.name)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Fits a name into the label gutter; the legend and the readout carry the full name. */
function endLabel(name: string): string {
  const short = name.replace(/ \(bot\)$/, "");
  return short.length > LABEL_CHARS ? `${short.slice(0, LABEL_CHARS - 1)}…` : short;
}

function Readout({ series, at, seconds, left }: { series: Series[]; at: number; seconds: number; left: number }) {
  const rows = [...series].sort((a, b) => (b.values[at] ?? 0) - (a.values[at] ?? 0));
  return (
    <div className="graph-readout" style={{ left: `${left}%` }}>
      <small>{clock(seconds)}</small>
      {rows.map((s) => (
        <div key={s.index} className="readout-row">
          <span className="line-key" style={{ background: s.color }} />
          <strong>{(s.values[at] ?? 0).toLocaleString()}</strong>
          <span>{s.name}</span>
        </div>
      ))}
    </div>
  );
}

/** The same numbers without the graph: one row per minute, plus the final sample. */
function DataTable({ series, seconds }: { series: Series[]; seconds: number[] }) {
  const rows = seconds.map((t, i) => ({ t, i })).filter(({ t, i }) => t % 60 === 0 || i === seconds.length - 1);
  return (
    <table>
      <thead>
        <tr>
          <th>Time</th>
          {series.map((s) => (
            <th key={s.index}>{s.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ t, i }) => (
          <tr key={i}>
            <td>{clock(t)}</td>
            {series.map((s) => (
              <td key={s.index}>{(s.values[i] ?? 0).toLocaleString()}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function compact(value: number): string {
  return value >= 10_000 ? `${Math.round(value / 1000)}k` : value >= 1000 ? `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(value);
}
