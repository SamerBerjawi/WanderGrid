import React from 'react';
import type { FlightAlert } from '../../../utils/flightAlerts';
import { Bell, BellOff, Clock, Warning, X, XCircle, type Icon } from '../../ui/hugeicons';
import { cn } from '../../../utils/cn';

/**
 * Alerts for the flights that are close: a delay, a new gate or terminal, a baggage belt, a cancellation, or a
 * connection at risk, newest first, with the first three shown. A bell turns browser notifications on or off.
 * Severity is the colour: rust is bad, mustard needs a look, green is good news.
 */

const LOOK: Record<FlightAlert['severity'], { box: string; icon: Icon; iconClass: string }> = {
    bad: { box: 'bg-rp-rust text-rp-paper', icon: XCircle, iconClass: '' },
    warn: { box: 'bg-rp-mustard text-rp-on-mustard', icon: Warning, iconClass: '' },
    info: { box: 'bg-rp-green text-rp-paper', icon: Clock, iconClass: '' },
};

export const FlightAlerts: React.FC<{
    alerts: FlightAlert[];
    onDismiss: (id: string) => void;
    notify: boolean;
    canNotify: boolean;
    onToggleNotify: () => void;
    watching: number;
}> = ({ alerts, onDismiss, notify, canNotify, onToggleNotify, watching }) => {
    if (alerts.length === 0 && !(canNotify && watching > 0)) return null;
    const shown = alerts.slice(0, 3);
    return (
        <section aria-label="Flight alerts" className="flex flex-col gap-2">
            {shown.map(a => {
                const look = LOOK[a.severity];
                return (
                    <div key={a.id} role="alert" className={cn('flex items-center gap-3 rounded-rp-tile py-2 pr-2 pl-4 rp-shadow-rest', look.box)}>
                        <look.icon size={20} className="shrink-0" aria-hidden />
                        <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-semibold">{a.title}</span>
                            <span className="truncate text-xs opacity-80">{a.detail}</span>
                        </span>
                        <button type="button" aria-label={`Dismiss: ${a.title}`} onClick={() => onDismiss(a.id)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-rp-paper"><X size={18} /></button>
                    </div>
                );
            })}
            {alerts.length > shown.length ? <p className="rp-tabular px-1 text-xs text-rp-muted">+{alerts.length - shown.length} more alerts</p> : null}
            {canNotify && watching > 0 ? (
                <button type="button" aria-pressed={notify} onClick={onToggleNotify} className="inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-rp-surface px-4 text-sm font-medium text-rp-ink outline-none rp-shadow-rest hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted">
                    {notify ? <Bell size={16} className="text-rp-ochre" aria-hidden /> : <BellOff size={16} className="text-rp-muted" aria-hidden />}
                    {notify ? 'Notifications on' : 'Notify me of changes'}
                </button>
            ) : null}
        </section>
    );
};
