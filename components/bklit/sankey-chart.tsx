/**
 * A vertical Sankey in BklitUI's conventions (its ParentSize wrapper, links that draw in with a staggered
 * enter transition, faded non-hovered links, a node/link/tooltip split), ported for WanderGrid's New pages
 * from the `@bklit/sankey-chart` registry item. The registry chart is horizontal, lays out with d3-sankey
 * and needs `--chart-*` variables; this one runs top to bottom (flow in across the top, one band in the
 * middle, flow out across the bottom), lays itself out (`sankey-layout.ts`, so a one-sided place works),
 * has no extra packages and takes colours from the rp-* tokens. Real props, no demo data. Every node is
 * focusable and acts like a button; the caller keeps a list as the accessible alternative.
 */
import { motion, useReducedMotion, useTransform } from "motion/react";
import { useId, useMemo, useState } from "react";
import { cn } from "@/utils/cn";
import { DEFAULT_CHART_ENTER_TRANSITION } from "./animation";
import { ParentSize } from "./chart-parent-size";
import { layoutFlow, placeLabels, ribbonPath } from "./sankey-layout";
import { useMountProgress } from "./use-mount-progress";

export type SankeyAccent = "green" | "rust" | "ink" | "mustard" | "navy" | "sea" | "plum" | "ochre" | "muted";

export interface SankeyFlowNode {
  key: string;
  /** Short text under or over the node. */
  label: string;
  /** Tooltip first line (the full name). */
  title: string;
  /** Tooltip second line (the count). */
  detail: string;
  /** Spoken name of the node's button. */
  ariaLabel: string;
  value: number;
  accent: SankeyAccent;
}

export interface SankeyChartProps {
  /** Nodes across the top; the flow runs down from them into the band. */
  top: SankeyFlowNode[];
  /** Nodes across the bottom; the flow runs down from the band into them. */
  bottom: SankeyFlowNode[];
  /** Text inside the middle band. */
  centerLabel: string;
  /** What the chart says, for assistive technology. */
  label: string;
  onSelect?: (key: string) => void;
  className?: string;
}

const NODE_H = 14;
const BAND_H = 34;
const LINK_H = 78;
const LABEL_H = 58;
const PAD_X = 4;
/** A side with no nodes gives up its rows, so a place with only arrivals or only departures is not half empty. */
const SIDE_H = LABEL_H + NODE_H + LINK_H;
const heightFor = (hasTop: boolean, hasBottom: boolean) => (hasTop ? SIDE_H : 0) + BAND_H + (hasBottom ? SIDE_H : 0);
const HUB = "rgb(var(--rp-ink))";
const colour = (a: SankeyAccent, alpha?: number) =>
  alpha == null ? `rgb(var(--rp-${a}))` : `rgb(var(--rp-${a}) / ${alpha})`;

interface Placed extends SankeyFlowNode { side: "top" | "bottom"; x: number; w: number; bx: number; path: string; y0: number; y1: number }

function Chart({ top, bottom, centerLabel, label, onSelect, width }: SankeyChartProps & { width: number }) {
  const reduce = useReducedMotion();
  const clipId = useId();
  const [active, setActive] = useState<string | null>(null);
  const inner = Math.max(0, width - PAD_X * 2);
  const progress = useMountProgress(reduce ? { duration: 0 } : DEFAULT_CHART_ENTER_TRANSITION, 0.05, label);
  const hasTop = top.length > 0;
  const hasBottom = bottom.length > 0;
  const HEIGHT = heightFor(hasTop, hasBottom);
  const reveal = useTransform(progress, v => v * (HEIGHT + 2));

  const placed = useMemo<Placed[]>(() => {
    const lay = layoutFlow(top.map(n => n.value), bottom.map(n => n.value), inner);
    const yTopNode = LABEL_H;
    const yTopBand = hasTop ? SIDE_H : 0;
    const yBotBand = yTopBand + BAND_H;
    const yBotNode = yBotBand + LINK_H;
    return [
      ...top.map((n, i) => ({ ...n, side: "top" as const, x: lay.top[i].node.x, w: lay.top[i].node.w, bx: lay.top[i].band.x, path: ribbonPath(lay.top[i].node, lay.top[i].band, yTopNode + NODE_H, yTopBand), y0: yTopNode + NODE_H, y1: yTopBand })),
      ...bottom.map((n, i) => ({ ...n, side: "bottom" as const, x: lay.bottom[i].node.x, w: lay.bottom[i].node.w, bx: lay.bottom[i].band.x, path: ribbonPath(lay.bottom[i].band, lay.bottom[i].node, yBotBand, yBotNode), y0: yBotBand, y1: yBotNode })),
    ];
  }, [top, bottom, inner, hasTop]);

  const labelSpots = useMemo(() => {
    const spots = new Map<string, { x: number; row: number }>();
    (["top", "bottom"] as const).forEach(side => {
      const list = placed.filter(p => p.side === side);
      placeLabels(list.map(p => p.x + p.w / 2), list.map(p => (p.label.length >= String(p.value).length ? p.label : String(p.value))), list.map(p => p.value), inner)
        .forEach(s => spots.set(list[s.index].key, { x: s.x, row: s.row }));
    });
    return spots;
  }, [placed, inner]);

  if (width < 40) return null;
  const hot = placed.find(p => p.key === active);
  const bandY = hasTop ? SIDE_H : 0;
  const linkTop = hasTop ? LABEL_H + NODE_H : 0;
  const linkBottom = bandY + BAND_H + LINK_H;
  const botNodeY = bandY + BAND_H + LINK_H;
  const usedL = Math.min(...placed.map(p => p.bx), inner);
  const usedR = Math.max(...placed.map(p => p.bx + p.w), 0);
  // Two-line labels (name, then count) on two rows: the second row sits further from the node.
  const labelY = (side: "top" | "bottom", row: number) =>
    side === "top" ? LABEL_H - 30 - row * 28 + 13 : botNodeY + NODE_H + 15 + row * 28;
  const fade = (key: string) => (active == null ? 1 : active === key ? 1 : 0.18);

  return (
    <div className="relative" style={{ width, height: HEIGHT }}>
      <svg width={width} height={HEIGHT} role="group" aria-label={label} className="overflow-visible">
        <defs>
          {placed.map(p => (
            <linearGradient key={p.key} id={`${clipId}-${p.key}`} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={p.y0} y2={p.y1}>
              <stop offset="0%" stopColor={p.side === "top" ? colour(p.accent) : HUB} />
              <stop offset="100%" stopColor={p.side === "top" ? HUB : colour(p.accent)} />
            </linearGradient>
          ))}
          <clipPath id={clipId}>
            <motion.rect x={0} y={linkTop} width={width} height={reveal} />
          </clipPath>
        </defs>
        <g transform={`translate(${PAD_X},0)`}>
          <g clipPath={`url(#${clipId})`}>
            {placed.map(p => (
              <motion.path
                key={p.key}
                d={p.path}
                fill={`url(#${clipId}-${p.key})`}
                initial={false}
                animate={{ opacity: fade(p.key) * (active === p.key ? 0.95 : 0.7) }}
                transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
                style={{ pointerEvents: "none" }}
              />
            ))}
          </g>
          {usedR > usedL ? <rect x={usedL} y={bandY} width={usedR - usedL} height={BAND_H} rx={9} fill={HUB} /> : null}
          <text x={inner / 2} y={bandY + BAND_H / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="rgb(var(--rp-on-ink))" style={{ fontVariantNumeric: "tabular-nums" }}>
            {centerLabel}
          </text>
          {placed.map(p => {
            const y = p.side === "top" ? LABEL_H : botNodeY;
            const spot = labelSpots.get(p.key);
            return (
              <g
                key={p.key}
                role="button"
                tabIndex={0}
                aria-label={p.ariaLabel}
                className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[rgb(var(--rp-ink))]"
                onMouseEnter={() => setActive(p.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(p.key)}
                onBlur={() => setActive(null)}
                onClick={() => onSelect?.(p.key)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(p.key); } }}
              >
                {/* A bigger invisible target than the thin node, for pointers and touch. */}
                <rect x={p.x - 1} y={p.side === "top" ? y - 22 : y - 4} width={p.w + 2} height={NODE_H + 26} fill="transparent" />
                <motion.rect x={p.x} y={y} width={p.w} height={NODE_H} rx={5} fill={colour(p.accent)} strokeWidth={2} stroke="transparent" animate={{ opacity: fade(p.key) }} transition={{ duration: reduce ? 0 : 0.18 }} />
                {spot ? (
                  <text x={spot.x} textAnchor="middle" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <tspan x={spot.x} y={p.side === "top" ? labelY(p.side, spot.row) - 13 : labelY(p.side, spot.row)} fontSize={12} fontWeight={600} fill="rgb(var(--rp-ink))">{p.label}</tspan>
                    <tspan x={spot.x} dy={13} fontSize={10.5} fill="rgb(var(--rp-muted))">{p.value}</tspan>
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
      {hot ? (
        <div
          role="presentation"
          className="pointer-events-none absolute z-popover max-w-[220px] -translate-x-1/2 rounded-lg bg-rp-ink px-2.5 py-1.5 text-xs text-rp-on-ink shadow-md"
          style={{
            left: Math.min(Math.max(PAD_X + hot.x + hot.w / 2, 80), width - 80),
            ...(hot.side === "top" ? { top: linkTop + 8 } : { top: linkBottom - 8, transform: "translate(-50%, -100%)" }),
          }}
        >
          <p className="truncate font-medium">{hot.title}</p>
          <p className="rp-tabular opacity-80">{hot.detail}</p>
        </div>
      ) : null}
    </div>
  );
}

export function SankeyChart(props: SankeyChartProps) {
  return (
    <div className={cn("w-full", props.className)} style={{ height: heightFor(props.top.length > 0, props.bottom.length > 0) }}>
      <ParentSize>{({ width }) => <Chart {...props} width={width} />}</ParentSize>
    </div>
  );
}

export default SankeyChart;
