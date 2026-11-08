/**
 * Lines of text from the pieces a PDF reader returns. A PDF stores words with positions, not lines, so words
 * on (nearly) the same height are joined, left to right, and the lines read top to bottom. Pure.
 */

export interface PdfPiece { str: string; x: number; y: number }

export const linesFromPieces = (pieces: PdfPiece[], tolerance = 3): string[] => {
    const rows: { y: number; items: PdfPiece[] }[] = [];
    for (const p of [...pieces].filter(p => p.str.trim()).sort((a, b) => b.y - a.y)) {
        const row = rows.find(r => Math.abs(r.y - p.y) <= tolerance);
        if (row) row.items.push(p); else rows.push({ y: p.y, items: [p] });
    }
    return rows
        .sort((a, b) => b.y - a.y)
        .map(r => r.items.sort((a, b) => a.x - b.x).map(i => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
};
