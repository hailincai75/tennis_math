// Small dependency-free SVG line chart with a crosshair tooltip.
// Used for the per-match momentum chart and the cross-match trend charts.
import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';

export interface ChartDatum {
  x: number;
  y: number;
  /** Tooltip text (may contain \n). */
  tip: string;
  /** Draw a marker at this point, colored by side. */
  marker?: 'elsa' | 'opp' | 'neutral';
}

interface Props {
  data: ChartDatum[];
  height?: number;
  /** Fixed y domain; defaults to the data extent (always including 0 when `zeroLine`). */
  yDomain?: [number, number];
  /** Draw a baseline at y=0 and tint above (Elsa) / below (opponent). */
  zeroLine?: boolean;
  /** Labels for the tinted halves, e.g. ['Elsa 领先', 'Mia 领先']. */
  halfLabels?: [string, string];
  separators?: { x: number; label: string }[];
  yFormat?: (y: number) => string;
  /** Number of y ticks (approximate). */
  yTicks?: number;
  ariaLabel: string;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const raw = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

export function LineChart({
  data,
  height = 180,
  yDomain,
  zeroLine = false,
  halfLabels,
  separators = [],
  yFormat = (y) => String(y),
  yTicks = 4,
  ariaLabel,
}: Props) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0) return <p className="muted">还没有数据</p>;

  const pad = { l: 36, r: 12, t: 12, b: 18 };
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  let [yMin, yMax] = yDomain ?? [Math.min(...ys), Math.max(...ys)];
  if (zeroLine) {
    yMin = Math.min(yMin, 0);
    yMax = Math.max(yMax, 0);
    const m = Math.max(Math.abs(yMin), Math.abs(yMax), 1); // symmetric so 0 sits in the middle
    yMin = -m;
    yMax = m;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const W = width;
  const H = height;
  const sx = (x: number) => pad.l + (xMax === xMin ? (W - pad.l - pad.r) / 2 : ((x - xMin) / (xMax - xMin)) * (W - pad.l - pad.r));
  const sy = (y: number) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${sx(d.x).toFixed(1)},${sy(d.y).toFixed(1)}`).join('');
  const ticks = niceTicks(yMin, yMax, yTicks);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    data.forEach((d, i) => {
      const dist = Math.abs(sx(d.x) - px);
      if (dist < bestD) {
        bestD = dist;
        best = i;
      }
    });
    setHover(best);
  };

  const h = hover !== null ? data[hover] : null;
  const tipLeft = h ? Math.min(Math.max(sx(h.x) - 80, 0), W - 160) : 0;

  return (
    <div className="chart" ref={wrapRef}>
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {zeroLine && (
          <>
            <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={sy(0) - pad.t} className="half-elsa" />
            <rect x={pad.l} y={sy(0)} width={W - pad.l - pad.r} height={H - pad.b - sy(0)} className="half-opp" />
            {halfLabels && (
              <>
                <text x={pad.l + 6} y={pad.t + 14} className="half-label">
                  {halfLabels[0]}
                </text>
                <text x={pad.l + 6} y={H - pad.b - 6} className="half-label">
                  {halfLabels[1]}
                </text>
              </>
            )}
          </>
        )}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} className={t === 0 && zeroLine ? 'axis' : 'grid'} />
            <text x={pad.l - 6} y={sy(t) + 4} className="tick" textAnchor="end">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {separators.map((s) => (
          <g key={s.x}>
            <line x1={sx(s.x)} x2={sx(s.x)} y1={pad.t} y2={H - pad.b} className="grid" />
            <text x={sx(s.x) + 4} y={H - 4} className="tick">
              {s.label}
            </text>
          </g>
        ))}
        <path d={path} className="line" />
        {data.map((d, i) =>
          d.marker ? (
            <circle key={i} cx={sx(d.x)} cy={sy(d.y)} r={4.5} className={`marker ${d.marker}`} />
          ) : null,
        )}
        {h && (
          <>
            <line x1={sx(h.x)} x2={sx(h.x)} y1={pad.t} y2={H - pad.b} className="crosshair" />
            <circle cx={sx(h.x)} cy={sy(h.y)} r={5} className="marker focus" />
          </>
        )}
      </svg>
      {h && (
        <div className="chart-tip" style={{ left: tipLeft }}>
          {h.tip}
        </div>
      )}
    </div>
  );
}
