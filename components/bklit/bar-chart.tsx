/**
 * A bar chart in BklitUI's conventions (its ParentSize wrapper, a band scale for the categories, a linear
 * scale for the values, light grid lines, rounded bars), reduced for WanderGrid's New pages. The full
 * Bklit bar chart pulls in eight registry packages (context, tooltip, patterns, gradients and more) for
 * features these pages don't use, so this keeps only the bars, the grid and the two axes. Static: no
 * draw-in and no hover (UI_UX_DESIGN_REFERENCE.md decision 8); a hidden table carries the values for
 * screen readers. Colours are rp-* tokens.
 */
import { scaleBand, scaleLinear } from "d3";
import { useMemo } from "react";
import { cn } from "@/utils/cn";
import { ParentSize } from "./chart-parent-size";

export interface BarDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarDatum[];
  /** An rp token name for the bars: "green", "rust", "ink", "mustard". */
  color?: "green" | "rust" | "ink" | "mustard" | "navy" | "sea";
  /** Formats the value labels and the grid. */
  format?: (value: number) => string;
  /** What the chart is, for assistive technology. */
  label: string;
  className?: string;
}

const MARGIN = { top: 22, right: 8, bottom: 26, left: 8 };

const Bars = ({ data, color = "green", format = (v: number) => String(v), width, height }: BarChartProps & { width: number; height: number }) => {
  const innerW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerH = Math.max(0, height - MARGIN.top - MARGIN.bottom);
  const x = useMemo(() => scaleBand<string>().domain(data.map((d) => d.label)).range([0, innerW]).paddingInner(0.28).paddingOuter(0.1), [data, innerW]);
  const max = Math.max(1, ...data.map((d) => d.value));
  const y = useMemo(() => scaleLinear().domain([0, max]).nice(3).range([innerH, 0]), [max, innerH]);
  const ticks = y.ticks(3);
  const showValues = x.bandwidth() >= 26;
  const stride = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 38)));

  return (
    <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
      <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
        {ticks.map((t) => (
          <line key={t} x1={0} x2={innerW} y1={y(t)} y2={y(t)} stroke="rgb(var(--rp-line))" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "3 4"} />
        ))}
        {data.map((d, i) => {
          const bx = x(d.label) ?? 0;
          const bw = x.bandwidth();
          const bh = Math.max(d.value > 0 ? 2 : 0, innerH - y(d.value));
          const r = Math.min(8, bw / 2, bh);
          return (
            <g key={d.label}>
              {bh > 0 ? (
                <path
                  d={`M${bx},${innerH} V${innerH - bh + r} a${r},${r} 0 0 1 ${r},${-r} H${bx + bw - r} a${r},${r} 0 0 1 ${r},${r} V${innerH} Z`}
                  fill={`rgb(var(--rp-${color}))`}
                />
              ) : null}
              {showValues && d.value > 0 ? (
                <text x={bx + bw / 2} y={innerH - bh - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="rgb(var(--rp-ink))" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {format(d.value)}
                </text>
              ) : null}
              {i % stride === 0 ? (
                <text x={bx + bw / 2} y={innerH + 18} textAnchor="middle" fontSize={11} fill="rgb(var(--rp-muted))" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {d.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
    </svg>
  );
};

export function BarChart(props: BarChartProps) {
  const { data, label, className } = props;
  return (
    <figure className={cn("m-0", className)} aria-label={label}>
      <ParentSize className="h-full min-h-40">{({ width, height }) => (width > 0 && height > 0 ? <Bars {...props} width={width} height={height} /> : null)}</ParentSize>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{props.format ? props.format(d.value) : d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
