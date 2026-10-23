/**
 * Route arcs for the Bklit choropleth (WanderGrid addition, in the style of the other layers): great-circle
 * lines between two longitude/latitude points, drawn in the zoomed SVG layer with a constant on-screen
 * width. Static: no hover and no animation (UI_UX_DESIGN_REFERENCE.md decision 8).
 */
import { memo } from "react";
import { useChoroplethStable, useChoroplethZoom } from "./choropleth-context";

export interface ChoroplethRoute {
  id: string;
  from: [number, number];
  to: [number, number];
  stroke: string;
  dashed?: boolean;
  opacity?: number;
  /** A traced road, rail or sea lane to draw instead of the great circle (WanderGrid addition). */
  path?: [number, number][];
}

export interface ChoroplethRoutesProps {
  routes: ChoroplethRoute[];
  /** Line width on screen, in px. Default 1.25. */
  strokeWidth?: number;
}

export const ChoroplethRoutes = memo(function ChoroplethRoutes({ routes, strokeWidth = 1.25 }: ChoroplethRoutesProps) {
  const { rawPathGenerator } = useChoroplethStable();
  const { zoom } = useChoroplethZoom();
  const scale = zoom?.transformMatrix.scaleX ?? 1;
  return (
    <g className="choropleth-routes" fill="none" strokeLinecap="round" pointerEvents="none">
      {routes.map((r) => {
        const d = rawPathGenerator({ type: "LineString", coordinates: r.path && r.path.length > 2 ? r.path : [r.from, r.to] });
        return d ? (
          <path
            key={r.id}
            d={d}
            stroke={r.stroke}
            strokeWidth={strokeWidth / scale}
            strokeDasharray={r.dashed ? `${3 / scale} ${3 / scale}` : undefined}
            opacity={r.opacity ?? 0.8}
          />
        ) : null;
      })}
    </g>
  );
});

ChoroplethRoutes.displayName = "ChoroplethRoutes";

export default ChoroplethRoutes;
