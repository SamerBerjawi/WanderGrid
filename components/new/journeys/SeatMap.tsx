import React from 'react';
import type { Transport } from '../../../types';
import { cn } from '../../../utils/cn';

/**
 * The seat on a small plan of the cabin: the rows around it, the seat in green with its letter, and
 * whether it is a window, middle or aisle seat. The plan is a guide (3-3, or 3-4-3 when the seat letter
 * is past F), not the airline's own layout.
 */

const NARROW = [['A', 'B', 'C'], ['D', 'E', 'F']];
const WIDE = [['A', 'B', 'C'], ['D', 'E', 'F', 'G'], ['H', 'J', 'K']];

const kindOf = (letter: string, blocks: string[][]): 'Window' | 'Middle' | 'Aisle' => {
    const bi = blocks.findIndex(b => b.includes(letter));
    if (bi < 0) return 'Middle';
    const block = blocks[bi];
    const at = block.indexOf(letter);
    const edge = (at === 0 && bi === 0) || (at === block.length - 1 && bi === blocks.length - 1);
    if (edge) return 'Window';
    if (at === 0 || at === block.length - 1) return 'Aisle';
    return 'Middle';
};

export const SeatMap: React.FC<{ t: Pick<Transport, 'seatNumber' | 'seatType' | 'travelClass'> }> = ({ t }) => {
    const m = (t.seatNumber || '').match(/(\d+)\s*([A-Za-z])/);
    if (!m) return null;
    const row = parseInt(m[1], 10);
    const letter = m[2].toUpperCase();
    const blocks = 'GHJK'.includes(letter) ? WIDE : NARROW;
    const kind = t.seatType || kindOf(letter, blocks);
    const rows = Array.from({ length: 5 }, (_, i) => row - 2 + i).filter(r => r >= 1);
    return (
        <div className="flex flex-col items-center gap-3 py-2 sm:flex-row sm:justify-between">
            <div role="img" aria-label={`Seat ${row}${letter}, ${kind.toLowerCase()}`} className="flex flex-col items-center gap-1 rounded-rp-inset bg-rp-surface px-4 py-3">
                {rows.map(r => (
                    <div key={r} className="flex items-center gap-3">
                        {blocks.map((block, bi) => (
                            <React.Fragment key={bi}>
                                <div className="flex gap-1">
                                    {block.map(l => {
                                        const mine = r === row && l === letter;
                                        return (
                                            <span key={l} className={cn('flex size-6 items-center justify-center rounded-md text-2xs font-semibold', mine ? 'bg-rp-green text-rp-paper' : 'bg-rp-line')}>{mine ? l : ''}</span>
                                        );
                                    })}
                                </div>
                                {bi === 0 ? <span className="rp-tabular w-5 text-center text-2xs text-rp-muted">{r}</span> : null}
                            </React.Fragment>
                        ))}
                    </div>
                ))}
            </div>
            <div className="flex flex-col items-center gap-0.5 sm:items-end">
                <span className="rp-tabular text-[1.75rem] leading-none font-medium text-rp-ink">{row}{letter}</span>
                <span className="text-sm text-rp-muted">{kind}{t.travelClass ? ` · ${t.travelClass}` : ''}</span>
            </div>
        </div>
    );
};
