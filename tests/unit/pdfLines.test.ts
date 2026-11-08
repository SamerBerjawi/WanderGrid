import { describe, expect, it } from 'vitest';
import { linesFromPieces } from '../../utils/pdfLines';

describe('lines from the pieces of a PDF', () => {
    it('joins pieces on the same height left to right, and reads the lines top to bottom', () => {
        const lines = linesFromPieces([
            { str: 'Arrival', x: 10, y: 600 }, { str: 'FRA', x: 120, y: 601.5 }, { str: 'Frankfurt', x: 60, y: 600.4 },
            { str: 'Departure', x: 10, y: 700 }, { str: 'BRU', x: 80, y: 700 },
            { str: '   ', x: 5, y: 650 },
        ]);
        expect(lines).toEqual(['Departure BRU', 'Arrival Frankfurt FRA']);
    });
    it('keeps pieces that are apart on separate lines, and copes with none', () => {
        expect(linesFromPieces([{ str: 'a', x: 0, y: 100 }, { str: 'b', x: 0, y: 90 }])).toEqual(['a', 'b']);
        expect(linesFromPieces([])).toEqual([]);
    });
});
