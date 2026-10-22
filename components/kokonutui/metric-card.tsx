/**
 * KokonutUI Metric Card (registry slug `metric-card`), ported for WanderGrid's New pages: rp-* tokens
 * (the line takes one accent, the pinned events are rust), the big number rolls with NumberFlow, the
 * periods and every format are props (`valueFormat` for the number, `formatValue` for text), dates go
 * through `formatDate`, and the demo data is gone. The card chrome is removed so a widget can wrap it.
 * One addition: `smoothing` draws the line through a moving average of the days (travel is sparse and
 * spiky), while the totals, the day reads and the breakdown keep the real daily values.
 *
 * @author: @dorianbaffier
 * @description: Metric Card
 * @version: 2.0.0
 * @date: 2026-10-17
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import NumberFlow from "@number-flow/react";
import {
  type ComponentProps,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/utils/cn";
import { formatDate } from "@/utils/formatters";

type NumberFlowFormat = ComponentProps<typeof NumberFlow>["format"];

// The chart's drawing box; it stretches to the card's width.
const W = 400;
const H = 120;
const PAD_Y = 10;
// Every period is resampled to this many points, so one shape can morph into another.
const SAMPLES = 90;
const MORPH_MS = 420;
const SNAP_PX = 6;

// Swatches for the breakdown, one accent per segment. The charted segment takes the card's accent.
const SWATCH_CLASSES = ["bg-rp-ink", "bg-rp-rust", "bg-rp-ochre", "bg-rp-sea"];

export interface MetricPoint {
  /** YYYY-MM-DD */
  date: string;
  /** One value per segment, in the order of `segments`. */
  parts: number[];
}

export interface MetricEvent {
  /** YYYY-MM-DD */
  date: string;
  label: string;
}

export interface MetricPeriod {
  days: number;
  label: string;
}

export interface MetricCardProps {
  label: string;
  /** Replaces the label at the start of the header, e.g. a metric switch. The label stays the accessible name. */
  headerStart?: ReactNode;
  /** Names of the parts that add up to the metric. */
  segments: string[];
  /** Daily values, oldest first. Needs twice the longest period, so each period has one to compare with. */
  data: MetricPoint[];
  /** Days worth a note, such as a trip. Pinned on the chart. */
  events?: MetricEvent[];
  periods: MetricPeriod[];
  defaultPeriod?: number;
  /** Options for the rolling big number. */
  valueFormat?: NumberFlowFormat;
  /** Text after the big number, e.g. " km". */
  suffix?: string;
  /** Formats a value in text: the breakdown rows and the accessible readout. */
  formatValue: (value: number) => string;
  /** Moving-average window, in days, for the drawn line. Totals and reads keep the real values. */
  smoothing?: (periodDays: number) => number;
  /** The one accent of the line. */
  accent?: "ink" | "green" | "rust" | "mustard";
  /** Columns of the breakdown rows. Two keeps a tall card shorter. */
  breakdownColumns?: 1 | 2;
  className?: string;
}

interface Span {
  lo: number;
  hi: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);

const formatDay = (date: string) => formatDate(date, "weekday-short");
const formatShort = (date: string) => formatDate(date, "short");

/** Linear resample of `values` to `count` evenly spaced points. */
function resample(values: number[], count: number) {
  const out = new Array<number>(count);
  if (values.length < 2) {
    out.fill(values[0] ?? 0);
    return out;
  }
  for (let i = 0; i < count; i++) {
    const at = (i / (count - 1)) * (values.length - 1);
    const lo = Math.floor(at);
    const hi = Math.min(values.length - 1, lo + 1);
    out[i] = values[lo] + (values[hi] - values[lo]) * (at - lo);
  }
  return out;
}

/** A centred, repeatedly averaged (near-Gaussian) smoothing of the given window, in days. */
function smooth(values: number[], window: number) {
  if (window <= 1) {
    return values;
  }
  const half = Math.floor(window / 2);
  const pass = (list: number[]) =>
    list.map((_, i) => {
      let total = 0;
      let n = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(list.length - 1, i + half); j++) {
        total += list[j];
        n++;
      }
      return total / n;
    });
  // Three passes make a near-Gaussian kernel: a spike becomes a round hill, not a point or a plateau.
  return pass(pass(pass(values)));
}

const yOf = (height: number) => PAD_Y + (1 - height) * (H - PAD_Y * 2);

/** Heights 0..1 to an SVG path, smoothed with a Catmull-Rom spline. */
function toPath(heights: number[]) {
  if (!heights.length) {
    return "";
  }
  const pts = heights.map((h, i) => [(i / Math.max(1, heights.length - 1)) * W, yOf(h)]);
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

/** The line closed down to the baseline. */
const toArea = (line: string) => `${line}L${W} ${H}L0 ${H}Z`;

interface Shape {
  current: number[];
  previous: number[];
}

interface Paths {
  current: string;
  previous: string;
}

/** One period's numbers and its shape, for the whole metric or one segment. */
function buildPeriod(data: MetricPoint[], days: number, focus: number | null, blur: number) {
  const current = data.slice(-days);
  const previous = data.slice(-days * 2, -days);
  const pick = (p: MetricPoint) => (focus === null ? sum(p.parts) : (p.parts[focus] ?? 0));
  const now = current.map(pick);
  const before = previous.map(pick);
  // What the lines draw: the real days, or their moving average.
  const lineNow = smooth(now, blur);
  const lineBefore = smooth(before, blur);
  const all = [...lineNow, ...lineBefore];
  const lo = 0;
  const hi = (Math.max(0, ...all) || 1) * 1.12;
  const norm = (v: number) => (v - lo) / (hi - lo || 1);
  return {
    current,
    previous,
    now,
    before,
    lineNow,
    lineBefore,
    // Resampled to a common length for morphing between views.
    shape: {
      current: resample(lineNow.map(norm), SAMPLES),
      previous: resample(lineBefore.map(norm), SAMPLES),
    } as Shape,
    // Drawn through the real days once it lands, so the dots sit on it.
    paths: {
      current: toPath(lineNow.map(norm)),
      previous: toPath(lineBefore.map(norm)),
    } as Paths,
    norm,
  };
}

/** Sum of `values` over a span of days, or all of them. */
const total = (values: number[], span: Span | null) => sum(span ? values.slice(span.lo, span.hi + 1) : values);

/** Each segment's share of the span. */
function breakdown(points: MetricPoint[], span: Span | null, count: number) {
  const parts = new Array<number>(count).fill(0);
  const days = span ? points.slice(span.lo, span.hi + 1) : points;
  for (const point of days) {
    for (let i = 0; i < count; i++) {
      parts[i] += point.parts[i] ?? 0;
    }
  }
  return parts;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

type Period = ReturnType<typeof buildPeriod>;

/** A range once the drag covers two days or more, else the cursor's day. */
function spanOf(
  range: { a: number; b: number } | null,
  cursor: number | null,
  last: number
): { span: Span | null; ranged: boolean } {
  if (range && range.a !== range.b) {
    return {
      span: { lo: Math.min(range.a, range.b), hi: Math.max(range.a, range.b) },
      ranged: true,
    };
  }
  if (cursor !== null && cursor <= last) {
    return { span: { lo: cursor, hi: cursor }, ranged: false };
  }
  return { span: null, ranged: false };
}

/** What the card reads: a range, one day, or the whole period. */
function readOf(info: Period, span: Span | null, ranged: boolean, period: number, events: MetricEvent[]) {
  const day = span && !ranged ? info.current[span.lo] : undefined;
  const twin = span && !ranged ? info.previous[span.lo] : undefined;
  const value = total(info.now, span);
  const compare = total(info.before, span);
  const event = day ? events.find((e) => e.date === day.date) : undefined;
  let caption = `vs previous ${period} days`;
  if (ranged && span) {
    const days = span.hi - span.lo + 1;
    caption = `${formatShort(info.current[span.lo].date)} – ${formatShort(info.current[span.hi].date)} vs prior ${days} days`;
  } else if (day) {
    caption = `${formatDay(day.date)} vs ${formatShort(twin?.date ?? day.date)}`;
  }
  return {
    day,
    twin,
    value,
    compare,
    delta: compare ? (value - compare) / compare : 0,
    event,
    caption,
  };
}

/** Each segment's share of what the card reads. Pick one to chart it alone. */
function Breakdown({
  segments,
  parts,
  focus,
  label,
  format,
  columns,
  accentSwatch,
  onChoose,
}: {
  segments: string[];
  parts: number[];
  focus: number | null;
  label: string;
  format: (value: number) => string;
  columns: 1 | 2;
  accentSwatch: string;
  onChoose: (index: number) => void;
}) {
  const partsTotal = sum(parts);
  const swatch = (i: number) => (focus === i ? accentSwatch : SWATCH_CLASSES[i % SWATCH_CLASSES.length]);
  return (
    <div className="mt-4 border-rp-line border-t pt-4">
      <div aria-hidden className="flex h-1.5 gap-0.5">
        {segments.map((name, i) => (
          <span
            className={cn(
              "min-w-0 rounded-full transition-[flex-grow,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
              swatch(i),
              focus !== null && focus !== i && "opacity-25"
            )}
            key={name}
            style={{ flexGrow: parts[i] ?? 0 }}
          />
        ))}
      </div>
      <ul className={cn("-mx-2 mt-2", columns === 2 && "grid grid-cols-2 gap-x-2")}>
        {segments.map((name, i) => {
          const share = partsTotal ? (parts[i] / partsTotal) * 100 : 0;
          return (
            <li key={name}>
              <button
                aria-label={focus === i ? `Show all of ${label}` : `Show only ${name}`}
                aria-pressed={focus === i}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm outline-none transition-[background-color,opacity] duration-150 ease-out hover:bg-rp-inset/60 focus-visible:ring-2 focus-visible:ring-rp-muted",
                  focus === i && "bg-rp-inset hover:bg-rp-inset",
                  focus !== null && focus !== i && "opacity-50"
                )}
                onClick={() => onChoose(i)}
                type="button"
              >
                <span className={cn("size-2 shrink-0 rounded-full", swatch(i))} />
                <span className="flex-1 truncate text-rp-muted">{name}</span>
                <span className="font-medium tabular-nums text-rp-ink">{format(parts[i] ?? 0)}</span>
                <span className="w-10 text-right text-rp-muted tabular-nums">{share.toFixed(0)}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Arrow keys walk the days; with Shift they stretch a range from the cursor. */
function keyStep(key: string, last: number) {
  const moves: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    Home: -last,
    End: last,
  };
  return moves[key];
}

const LINE_STROKE: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  ink: "stroke-rp-ink",
  green: "stroke-rp-green",
  rust: "stroke-rp-rust",
  mustard: "stroke-rp-ochre",
};
const LINE_DIM: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  ink: "stroke-rp-ink/25",
  green: "stroke-rp-green/25",
  rust: "stroke-rp-rust/25",
  mustard: "stroke-rp-ochre/25",
};
const AREA_FILL: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  ink: "fill-rp-ink/[0.06]",
  green: "fill-rp-green/10",
  rust: "fill-rp-rust/10",
  mustard: "fill-rp-ochre/10",
};
const DOT_FILL: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  ink: "bg-rp-ink",
  green: "bg-rp-green",
  rust: "bg-rp-rust",
  mustard: "bg-rp-ochre",
};

export function MetricCard({
  label,
  headerStart,
  segments,
  data,
  events = [],
  periods,
  defaultPeriod,
  valueFormat,
  suffix,
  formatValue,
  smoothing,
  accent = "ink",
  breakdownColumns = 1,
  className,
}: MetricCardProps) {
  const clipId = `${useId().replace(/:/g, "")}-lit`;
  const [period, setPeriod] = useState(defaultPeriod ?? periods[0]?.days ?? 30);
  const [focus, setFocus] = useState<number | null>(null);
  // The day under the pointer or keyboard cursor.
  const [cursor, setCursor] = useState<number | null>(null);
  // A pinned range: where the drag began and where it is now.
  const [range, setRange] = useState<{ a: number; b: number } | null>(null);
  const drag = useRef<number | null>(null);
  const blur = smoothing ? smoothing(period) : 1;
  const info = useMemo(() => buildPeriod(data, period, focus, blur), [data, period, focus, blur]);

  const currentRef = useRef<SVGPathElement>(null);
  const currentDimRef = useRef<SVGPathElement>(null);
  const areaRef = useRef<SVGPathElement>(null);
  const previousRef = useRef<SVGPathElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const shown = useRef<Shape>(info.shape);
  const morph = useRef({ raf: 0 });

  // A new period or segment morphs the lines from where they are now.
  useEffect(() => {
    const from = shown.current;
    const to = info.shape;
    const m = morph.current;
    cancelAnimationFrame(m.raf);
    const paint = (paths: Paths) => {
      currentRef.current?.setAttribute("d", paths.current);
      currentDimRef.current?.setAttribute("d", paths.current);
      areaRef.current?.setAttribute("d", toArea(paths.current));
      previousRef.current?.setAttribute("d", paths.previous);
    };
    const land = () => {
      shown.current = to;
      paint(info.paths);
    };
    if (from === to || globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      land();
      return;
    }
    const start = performance.now();
    const frame = (now: number) => {
      const t = easeInOut(Math.min(1, (now - start) / MORPH_MS));
      const mix = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] - v) * t);
      shown.current = {
        current: mix(from.current, to.current),
        previous: mix(from.previous, to.previous),
      };
      if (t < 1) {
        paint({
          current: toPath(shown.current.current),
          previous: toPath(shown.current.previous),
        });
        m.raf = requestAnimationFrame(frame);
      } else {
        land();
      }
    };
    m.raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(m.raf);
  }, [info.shape, info.paths]);

  const last = Math.max(0, info.current.length - 1);

  const pinned = useMemo(
    () =>
      events
        .map((e) => ({
          ...e,
          at: info.current.findIndex((p) => p.date === e.date),
        }))
        .filter((e) => e.at >= 0),
    [events, info.current]
  );

  const indexAt = useCallback(
    (clientX: number) => {
      const rect = chartRef.current?.getBoundingClientRect();
      if (!rect) {
        return 0;
      }
      const t = clamp((clientX - rect.left) / rect.width, 0, 1);
      // Pinned days pull the cursor in, so their notes are easy to land on.
      const near = pinned.find((e) => Math.abs((e.at / (last || 1) - t) * rect.width) < SNAP_PX);
      return near ? near.at : Math.round(t * last);
    },
    [last, pinned]
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = indexAt(event.clientX);
    drag.current = at;
    setRange(null);
    setCursor(at);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const at = indexAt(event.clientX);
    if (drag.current !== null) {
      // Dragging past the first day turns the read into a range.
      const anchor = drag.current;
      setRange((r) => (r || at !== anchor ? { a: anchor, b: at } : null));
      setCursor(at);
    } else if (event.pointerType === "mouse" && !range) {
      // Mouse reads on hover; touch only while pressed.
      setCursor(at);
    }
  };

  const release = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (event.pointerType !== "mouse") {
      setCursor(null);
    }
  };

  const clearRead = () => {
    setRange(null);
    setCursor(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      clearRead();
      return;
    }
    const move = keyStep(event.key, last);
    if (move === undefined) {
      return;
    }
    event.preventDefault();
    const from = range ? range.b : (cursor ?? last);
    const to = clamp(from + move, 0, last);
    if (event.shiftKey) {
      setRange({ a: range ? range.a : from, b: to });
    } else {
      setRange(null);
    }
    setCursor(to);
  };

  const choosePeriod = (days: number) => {
    clearRead();
    setPeriod(days);
  };

  const chooseSegment = (index: number) => {
    setFocus((f) => (f === index ? null : index));
  };

  const { span, ranged } = spanOf(range, cursor, last);
  const { day, twin, value, compare, delta, event, caption } = readOf(info, span, ranged, period, events);
  const up = delta >= 0;
  const parts = breakdown(info.current, span, segments.length);
  const formatted = formatValue(value);
  let valueText = `${formatted} in total`;
  if (ranged) {
    valueText = `${caption}: ${formatted}`;
  } else if (day) {
    valueText = `${formatDay(day.date)}: ${formatted}${event ? `, ${event.label}` : ""}`;
  }

  const xOf = (i: number) => (last ? (i / last) * W : W);
  const pct = (i: number) => (xOf(i) / W) * 100;
  // The lit part of the line: up to the read day, across the range, or all.
  const litFrom = ranged && span ? xOf(span.lo) : 0;
  const litTo = span ? xOf(span.hi) : W;
  const endY = info.lineNow.length ? yOf(info.norm(info.lineNow[last])) : 0;
  const firstDay = info.current[0];
  const lastDay = info.current.at(-1);
  const periodIndex = Math.max(
    0,
    periods.findIndex((p) => p.days === period)
  );

  return (
    <div className={cn("flex w-full select-none flex-col", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {headerStart ?? (
          <p className="truncate text-sm text-rp-muted">
            {label}
            {focus !== null && <span className="text-rp-ink"> · {segments[focus]}</span>}
          </p>
        )}
        <div className="relative flex shrink-0 rounded-full bg-rp-inset p-0.5 text-xs">
          {/* One pill slides between the periods. */}
          <span
            aria-hidden
            className="absolute top-0.5 bottom-0.5 left-0.5 w-11 rounded-full bg-rp-surface rp-shadow-soft transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
            style={{ transform: `translateX(${periodIndex * 100}%)` }}
          />
          {periods.map((p) => (
            <button
              aria-pressed={p.days === period}
              className={cn(
                "relative min-h-11 w-11 rounded-full py-1 font-medium tabular-nums outline-none transition-colors duration-200 ease-out focus-visible:ring-2 focus-visible:ring-rp-muted",
                p.days === period ? "text-rp-ink" : "text-rp-muted hover:text-rp-ink"
              )}
              key={p.days}
              onClick={() => choosePeriod(p.days)}
              type="button"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 font-semibold text-4xl tracking-tight text-rp-ink">
        <span className="sr-only">{formatted}</span>
        <NumberFlow aria-hidden className="rp-tabular" format={valueFormat} suffix={suffix} value={value} />
      </p>
      <div className="mt-1.5 flex min-h-5 items-center gap-2 text-sm tabular-nums">
        {compare ? (
          <span className={cn("shrink-0 font-medium", up ? "text-rp-green" : "text-rp-rust")}>
            {up ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(0)}%
          </span>
        ) : null}
        <span aria-live="polite" className="truncate text-rp-muted">
          {caption}
          {event && <span className="text-rp-rust"> · {event.label}</span>}
        </span>
        {ranged && (
          <button
            className="ml-auto min-h-11 shrink-0 rounded-full px-3 text-xs text-rp-muted outline-none transition-colors duration-150 ease-out hover:bg-rp-inset hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted"
            onClick={clearRead}
            type="button"
          >
            Clear
          </button>
        )}
      </div>

      <div
        aria-label={`${label} over the last ${period} days. Arrow keys read each day; hold Shift to select a range.`}
        aria-valuemax={info.current.length}
        aria-valuemin={1}
        aria-valuenow={span ? span.hi + 1 : info.current.length}
        aria-valuetext={valueText}
        className="relative mt-4 h-32 min-h-24 flex-1 cursor-crosshair touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-4 focus-visible:ring-offset-rp-surface"
        onBlur={() => setCursor(null)}
        onKeyDown={handleKeyDown}
        onLostPointerCapture={release}
        onPointerCancel={release}
        onPointerDown={handlePointerDown}
        onPointerLeave={() => {
          if (drag.current === null && !range) {
            setCursor(null);
          }
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={release}
        ref={chartRef}
        role="slider"
        tabIndex={0}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox={`0 0 ${W} ${H}`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect height={H + 20} width={Math.max(0, litTo - litFrom)} x={litFrom} y={-10} />
            </clipPath>
          </defs>
          <line className="stroke-rp-line" vectorEffect="non-scaling-stroke" x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} />
          <path
            className="fill-none stroke-rp-muted/50"
            d={info.paths.previous}
            ref={previousRef}
            strokeDasharray="3 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
          />
          {/* The area only fills the part being read. */}
          <path className={AREA_FILL[accent]} clipPath={`url(#${clipId})`} d={toArea(info.paths.current)} ref={areaRef} />
          <path
            className={cn("fill-none", LINE_DIM[accent])}
            d={info.paths.current}
            ref={currentDimRef}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          <path
            className={cn("fill-none", LINE_STROKE[accent])}
            clipPath={`url(#${clipId})`}
            d={info.paths.current}
            ref={currentRef}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {pinned.map((e) => (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 bottom-0 w-px -translate-x-1/2"
            key={e.date}
            style={{ left: `${pct(e.at)}%` }}
          >
            <div className="absolute inset-y-0 left-0 border-rp-rust/30 border-l border-dashed" />
            <div className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-rp-rust ring-2 ring-rp-surface" />
          </div>
        ))}

        {ranged &&
          span &&
          [span.lo, span.hi].map((i) => (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-rp-muted/40"
              key={i}
              style={{ left: `${pct(i)}%` }}
            />
          ))}

        {day && span && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-rp-line"
              style={{ left: `${pct(span.lo)}%` }}
            />
            {twin && (
              <div
                aria-hidden
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-rp-muted/60 bg-rp-surface"
                style={{
                  left: `${pct(span.lo)}%`,
                  top: `${(yOf(info.norm(info.lineBefore[span.lo] ?? 0)) / H) * 100}%`,
                }}
              />
            )}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-rp-surface",
                DOT_FILL[accent]
              )}
              style={{
                left: `${pct(span.lo)}%`,
                top: `${(yOf(info.norm(info.lineNow[span.lo] ?? 0)) / H) * 100}%`,
              }}
            />
          </>
        )}

        {/* Today, at rest. It rides the morph to the new end. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute right-0 size-2 translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-rp-surface transition-[top,opacity] duration-[420ms] ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none",
            DOT_FILL[accent],
            span ? "opacity-0" : "opacity-100"
          )}
          style={{ top: `${(endY / H) * 100}%` }}
        />
      </div>

      <div className="mt-2 flex justify-between text-xs text-rp-muted tabular-nums">
        <span>{firstDay ? formatShort(firstDay.date) : ""}</span>
        <span className="flex items-center gap-1.5">
          <span className="h-px w-3 border-rp-muted/50 border-t border-dashed" />
          Previous period
        </span>
        <span>{lastDay ? formatShort(lastDay.date) : ""}</span>
      </div>

      <Breakdown
        focus={focus}
        accentSwatch={DOT_FILL[accent]}
        columns={breakdownColumns}
        format={formatValue}
        label={label}
        onChoose={chooseSegment}
        parts={parts}
        segments={segments}
      />
    </div>
  );
}
