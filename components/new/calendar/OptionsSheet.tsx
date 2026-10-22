import React, { useEffect, useState } from 'react';
import { dataService } from '../../../services/mockDb';
import { calendarService } from '../../../services/calendarExport';
import { errorMessage, toast } from '../../../services/toast';
import type { Trip } from '../../../types';
import type { WeekStart } from '../../../utils/calendarModel';
import HoldButton from '../../kokonutui/hold-button';
import { Copy, DownloadSimple, Export } from '../../ui/hugeicons';
import { RP_FIELD } from '../fields';
import { RpChip, RpSection, RpSheet } from '../ui';

/**
 * Options: the first day of the week (kept on this device), the link that adds your trips to a calendar
 * app (a private feed: anyone with the link can read it, so it can be replaced), and a one-off .ics file.
 */

const WEEK_CHOICES: { id: WeekStart; label: string }[] = [
    { id: 1, label: 'Monday' },
    { id: 0, label: 'Sunday' },
    { id: 6, label: 'Saturday' },
];

const feedUrl = (token: string) => `${window.location.origin}/api/calendar/${token}/feed.ics`;

export const OptionsSheet: React.FC<{
    open: boolean;
    onClose: () => void;
    weekStart: WeekStart;
    onWeekStart: (w: WeekStart) => void;
    /** The trips the page shows, for the one-off file. */
    trips: Trip[];
}> = ({ open, onClose, weekStart, onWeekStart, trips }) => {
    const [token, setToken] = useState<string | null>(null);
    const [state, setState] = useState<'idle' | 'loading' | 'missing'>('idle');
    const server = dataService.isDatabaseMode();

    useEffect(() => {
        if (!open || !server || token) return;
        let cancelled = false;
        setState('loading');
        dataService.getCalendarFeedToken()
            .then(t => { if (!cancelled) { setToken(t); setState('idle'); } })
            .catch(() => { if (!cancelled) setState('missing'); });
        return () => { cancelled = true; };
    }, [open, server, token]);

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Link copied');
        } catch {
            toast.error("Couldn't copy. Select the link and copy it.");
        }
    };
    const rotate = async () => {
        try {
            setToken(await dataService.rotateCalendarFeedToken());
            toast.success('New link made. The old one stopped working.');
        } catch (e) {
            toast.error(errorMessage(e, "Couldn't make a new link."));
        }
    };
    const download = () => {
        calendarService.downloadIcs(calendarService.generateIcsContent(trips), 'wandergrid-calendar.ics');
    };

    return (
        <RpSheet open={open} onClose={onClose} title="Calendar options" width={440}>
            <div className="flex flex-col gap-5">
                <RpSection title="Week starts on">
                    <div role="group" aria-label="Week starts on" className="flex flex-wrap gap-2 py-2">
                        {WEEK_CHOICES.map(c => <RpChip key={c.id} selected={weekStart === c.id} onClick={() => onWeekStart(c.id)}>{c.label}</RpChip>)}
                    </div>
                </RpSection>

                <RpSection title="Add to a calendar app" icon={Export}>
                    {!server ? (
                        <p className="py-2 text-sm text-rp-muted">The link needs the server. In local mode you can download a file.</p>
                    ) : state === 'missing' ? (
                        <p className="py-2 text-sm text-rp-muted">The link isn't available right now. Try again later.</p>
                    ) : (
                        <div className="flex flex-col gap-2 py-2">
                            <label className="sr-only" htmlFor="calendar-feed">Calendar link</label>
                            <input id="calendar-feed" readOnly value={token ? feedUrl(token) : 'Loading…'} onFocus={e => e.currentTarget.select()} className={RP_FIELD} />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <button type="button" disabled={!token} onClick={() => token && void copy(feedUrl(token))} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none hover:bg-rp-ink/90 focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-40">
                                    <Copy size={16} aria-hidden /> Copy link
                                </button>
                                <HoldButton onHoldComplete={rotate} resetAfter={0}>Hold to make a new link</HoldButton>
                            </div>
                            <p className="text-xs text-rp-muted">Anyone with the link can see your trips. A new link stops the old one.</p>
                        </div>
                    )}
                </RpSection>

                <RpSection title="Download" icon={DownloadSimple}>
                    <div className="py-2">
                        <button type="button" onClick={download} disabled={trips.length === 0} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-surface px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-40">
                            <DownloadSimple size={16} aria-hidden /> Trips as .ics ({trips.length})
                        </button>
                    </div>
                </RpSection>
            </div>
        </RpSheet>
    );
};
