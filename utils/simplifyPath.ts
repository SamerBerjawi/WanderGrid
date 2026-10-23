/**
 * Douglas-Peucker line simplification, iterative so a very long road cannot overflow the stack.
 * `tolerance` is in the unit of the coordinates (degrees for longitude/latitude). The first and last
 * points are always kept. Used by the still maps, which would otherwise write tens of thousands of
 * vertices for a road they draw a few hundred pixels wide.
 */
export const simplifyPath = (pts: [number, number][], tolerance: number): [number, number][] => {
    const n = pts.length;
    if (n <= 2 || tolerance <= 0) return pts;
    const keep = new Uint8Array(n);
    keep[0] = 1; keep[n - 1] = 1;
    const stack: [number, number][] = [[0, n - 1]];
    const t2 = tolerance * tolerance;
    while (stack.length) {
        const [a, b] = stack.pop()!;
        const [ax, ay] = pts[a], [bx, by] = pts[b];
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let far = -1, farD = 0;
        for (let i = a + 1; i < b; i++) {
            const [px, py] = pts[i];
            let d2: number;
            if (len2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2;
            else {
                const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
                d2 = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
            }
            if (d2 > farD) { farD = d2; far = i; }
        }
        if (far >= 0 && farD > t2) { keep[far] = 1; stack.push([a, far], [far, b]); }
    }
    return pts.filter((_, i) => keep[i] === 1);
};
