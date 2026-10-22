export type LngLat = [number, number];

/** The box around some points, or null for none; a single point still gets a box so the map can fit it. */
export const boundsOf = (points: LngLat[]): [LngLat, LngLat] | null => {
    if (points.length === 0) return null;
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    points.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
    // A single point still needs a box to fit.
    if (minX === maxX && minY === maxY) { minX -= 0.5; maxX += 0.5; minY -= 0.3; maxY += 0.3; }
    return [[minX, minY], [maxX, maxY]];
};

