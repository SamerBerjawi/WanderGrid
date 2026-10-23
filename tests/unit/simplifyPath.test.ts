import { describe, expect, it } from 'vitest';
import { simplifyPath } from '../../utils/simplifyPath';

describe('simplifyPath', () => {
    it('drops points on a straight line and keeps both ends', () => {
        const line: [number, number][] = Array.from({ length: 50 }, (_, i) => [i, i * 2]);
        expect(simplifyPath(line, 0.01)).toEqual([[0, 0], [49, 98]]);
    });
    it('keeps a corner that is further than the tolerance', () => {
        const out = simplifyPath([[0, 0], [5, 0], [5, 5]], 0.5);
        expect(out).toEqual([[0, 0], [5, 0], [5, 5]]);
    });
    it('drops a wiggle smaller than the tolerance', () => {
        expect(simplifyPath([[0, 0], [5, 0.1], [10, 0]], 0.5)).toEqual([[0, 0], [10, 0]]);
    });
    it('leaves two points, and zero tolerance, alone', () => {
        const two: [number, number][] = [[0, 0], [1, 1]];
        expect(simplifyPath(two, 5)).toBe(two);
        const three: [number, number][] = [[0, 0], [1, 0.0001], [2, 0]];
        expect(simplifyPath(three, 0)).toBe(three);
    });
    it('handles a very long path without overflowing', () => {
        const long: [number, number][] = Array.from({ length: 200000 }, (_, i) => [i / 1000, Math.sin(i / 50)]);
        expect(simplifyPath(long, 0.01).length).toBeLessThan(long.length);
    });
});
