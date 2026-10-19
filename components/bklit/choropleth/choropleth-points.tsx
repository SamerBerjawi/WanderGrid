/**
 * Point markers for the Bklit choropleth (WanderGrid addition, in the style of the other layers): dots
 * at longitude/latitude, drawn in the zoomed SVG layer so they pan and zoom with the map, kept at a
 * constant on-screen size, with a label on hover or focus and an optional click handler.
 */
import { memo, useMemo, useState } from "react";
import { useChoroplethStable, useChoroplethZoom } from "./choropleth-context";

export interface ChoroplethPoint {
  id: string;
  lng: number;
  lat: number;
  label: string;
}

export interface ChoroplethPointsProps {
  points: ChoroplethPoint[];
  /** Dot radius on screen, in px. Default 3.5. */
  radius?: number;
  fill?: string;
  stroke?: string;
  /** Label colours. */
  labelColor?: string;
  labelHalo?: string;
  onPointClick?: (point: ChoroplethPoint) => void;
}

export const ChoroplethPoints = memo(function ChoroplethPoints({
  points,
  radius = 3.5,
  fill = "currentColor",
  stroke = "white",
  labelColor = "currentColor",
  labelHalo = "white",
  onPointClick,
}: ChoroplethPointsProps) {
  const { projectPoint } = useChoroplethStable();
  const { zoom } = useChoroplethZoom();
  const [active, setActive] = useState<string | null>(null);
  // The parent <g> scales with the zoom; divide it out so dots and text keep their size.
  const scale = zoom?.transformMatrix.scaleX ?? 1;

  const placed = useMemo(
    () =>
      points.flatMap((p) => {
        const xy = projectPoint([p.lng, p.lat]);
        return xy ? [{ ...p, x: xy[0], y: xy[1] }] : [];
      }),
    [points, projectPoint]
  );

  return (
    <g className="choropleth-points">
      {placed.map((p) => {
        const on = active === p.id;
        return (
          <g
            key={p.id}
            transform={`translate(${p.x} ${p.y}) scale(${1 / scale})`}
            onMouseEnter={() => setActive(p.id)}
            onMouseLeave={() => setActive((a) => (a === p.id ? null : a))}
            onClick={onPointClick ? () => onPointClick(p) : undefined}
            style={{ cursor: onPointClick ? "pointer" : "default" }}
          >
            {/* A larger invisible target for pointer and touch. */}
            <circle r={radius + 8} fill="transparent" />
            <circle r={on ? radius + 1.5 : radius} fill={fill} stroke={stroke} strokeWidth={1.5} />
            {on ? (
              <text
                y={-(radius + 8)}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={labelColor}
                stroke={labelHalo}
                strokeWidth={3}
                paintOrder="stroke"
                style={{ pointerEvents: "none" }}
              >
                {p.label}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
});

ChoroplethPoints.displayName = "ChoroplethPoints";

export default ChoroplethPoints;
