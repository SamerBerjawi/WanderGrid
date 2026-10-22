import React from 'react';
import { cn } from '../../../utils/cn';

/**
 * A small plain-SVG ring of leave by type (a stand-in until the Spending Ring port from the Dashboard
 * work lands; swap it then). Each segment is one leave type's used and planned days; the grey rest is
 * what is left of the allowance. The centre holds whatever the caller puts there.
 */

export interface RingSegment { id: string; label: string; days: number; className: string }

export const MemberRing: React.FC<{ segments: RingSegment[]; total: number; size?: number; label: string; children?: React.ReactNode; className?: string }> = ({
    segments, total, size = 168, label, children, className,
}) => {
    const stroke = 16;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const whole = Math.max(total, segments.reduce((sum, s) => sum + s.days, 0), 1);
    // A hairline gap between segments keeps neighbours apart without changing their sizes much.
    const gap = segments.length > 1 ? 3 : 0;
    let offset = 0;
    return (
        <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }} role="img" aria-label={label}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-rp-line" />
                {segments.filter(s => s.days > 0).map(s => {
                    const len = (s.days / whole) * c;
                    const dash = Math.max(0, len - gap);
                    const el = (
                        <circle
                            key={s.id}
                            cx={size / 2}
                            cy={size / 2}
                            r={r}
                            fill="none"
                            strokeWidth={stroke}
                            strokeLinecap="butt"
                            strokeDasharray={`${dash} ${c - dash}`}
                            strokeDashoffset={-offset}
                            className={cn('transition-[stroke-dasharray] duration-500', s.className)}
                        />
                    );
                    offset += len;
                    return el;
                })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
        </div>
    );
};

/** Leave type colours (EntitlementType.color) as rp-* accents: a ring stroke, a dot fill. */
export const LEAVE_COLOR: Record<string, { stroke: string; dot: string }> = {
    blue: { stroke: 'stroke-rp-sea', dot: 'bg-rp-sea' },
    cyan: { stroke: 'stroke-rp-sea', dot: 'bg-rp-sea' },
    teal: { stroke: 'stroke-rp-green', dot: 'bg-rp-green' },
    green: { stroke: 'stroke-rp-green', dot: 'bg-rp-green' },
    amber: { stroke: 'stroke-rp-mustard', dot: 'bg-rp-mustard' },
    red: { stroke: 'stroke-rp-rust', dot: 'bg-rp-rust' },
    purple: { stroke: 'stroke-rp-plum', dot: 'bg-rp-plum' },
    pink: { stroke: 'stroke-rp-plum', dot: 'bg-rp-plum' },
    indigo: { stroke: 'stroke-rp-navy', dot: 'bg-rp-navy' },
    gray: { stroke: 'stroke-rp-muted', dot: 'bg-rp-muted' },
};
export const leaveColor = (color?: string) => LEAVE_COLOR[color || 'gray'] || LEAVE_COLOR.gray;
