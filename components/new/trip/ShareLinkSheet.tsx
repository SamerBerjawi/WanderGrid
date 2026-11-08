import React, { useEffect, useState } from 'react';
import { RpSection, RpSheet } from '../ui';
import HoldButton from '../../kokonutui/hold-button';
import ParticleButton from '../../kokonutui/particle-button';
import { Check, Copy } from '../../ui/hugeicons';
import { createShare, getShare, linksAvailable, revokeShare, shareUrl } from '../../../services/sharedTrip';
import { errorMessage, toast } from '../../../services/toast';
import { cn } from '../../../utils/cn';

/**
 * Turns a trip's public link on or off and copies it. The link opens a read-only page for anyone who has it,
 * no account needed; turning it off ends it at once and a new link is a different address.
 */

const SHOWN = ['The route map, flights and stays', 'The plans for each day', 'First names of who is travelling'];
const HIDDEN = ['Costs and budget', 'Booking references and seats', 'Notes, packing lists and leave'];

const PILL = 'inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-rp-muted';

export const ShareLinkSheet: React.FC<{ open: boolean; tripId: string; tripName: string; onClose: () => void }> = ({ open, tripId, tripName, onClose }) => {
    const [token, setToken] = useState<string | null | undefined>(undefined);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const available = linksAvailable();

    useEffect(() => {
        if (!open || !available) return;
        let live = true;
        setToken(undefined); setError(''); setCopied(false);
        getShare(tripId).then(s => { if (live) setToken(s.token); }).catch(e => { if (live) { setToken(null); setError(errorMessage(e, "The link's state couldn't be read.")); } });
        return () => { live = false; };
    }, [open, tripId, available]);

    const turnOn = async () => {
        setError('');
        try { setToken((await createShare(tripId)).token); } catch (e) { setError(errorMessage(e, "The link couldn't be created.")); throw e; }
    };
    const turnOff = async () => {
        setError('');
        try { await revokeShare(tripId); setToken(null); setCopied(false); toast.success('Link turned off'); } catch (e) { setError(errorMessage(e, "The link couldn't be turned off.")); }
    };
    const url = token ? shareUrl(token) : '';
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            const field = document.getElementById('share-link-field') as HTMLInputElement | null;
            field?.select();
            toast.info('Press copy on your keyboard to copy the link');
            return;
        }
        setCopied(true);
        toast.success('Link copied');
        window.setTimeout(() => setCopied(false), 2000);
    };

    return (
        <RpSheet open={open} onClose={onClose} title="Share a link" subtitle={tripName}>
            <div className="flex flex-col gap-4">
                {!available ? (
                    <p className="text-sm text-rp-muted">Links need the WanderGrid server, so they can't work in local mode. Run the app against the server to share a trip.</p>
                ) : token === undefined ? (
                    <p role="status" className="text-sm text-rp-muted">Checking…</p>
                ) : (
                    <>
                        <p className="text-sm text-rp-muted">Anyone with the link can see this trip, without an account. They can't change anything.</p>
                        <RpSection title="What people see">
                            <ul className="flex flex-col gap-1.5 py-1 text-sm">
                                {SHOWN.map(t => <li key={t} className="flex items-center gap-2 text-rp-ink"><Check size={16} className="shrink-0 text-rp-green" aria-hidden />{t}</li>)}
                                {HIDDEN.map(t => <li key={t} className="flex items-center gap-2 text-rp-muted"><span aria-hidden className="flex size-4 shrink-0 items-center justify-center">–</span><span><span className="sr-only">Not shown: </span>{t}</span></li>)}
                            </ul>
                        </RpSection>
                        {token ? (
                            <RpSection title="Link">
                                <div className="flex flex-col gap-3 py-1">
                                    <label className="sr-only" htmlFor="share-link-field">Public link</label>
                                    <input id="share-link-field" readOnly value={url} onFocus={e => e.currentTarget.select()} className="min-h-11 w-full rounded-rp-inset bg-rp-inset px-4 font-mono text-xs text-rp-ink outline-none focus-visible:ring-2 focus-visible:ring-rp-muted" />
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <button type="button" onClick={() => void copy()} className={cn(PILL, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}>
                                            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}{copied ? 'Copied' : 'Copy link'}
                                        </button>
                                        <HoldButton onHoldComplete={() => { void turnOff(); }} resetAfter={0}>Hold to turn off</HoldButton>
                                    </div>
                                </div>
                            </RpSection>
                        ) : (
                            <div className="flex justify-end">
                                <ParticleButton onClick={turnOn} successDuration={500} onError={() => undefined} className="!min-h-11">Create link</ParticleButton>
                            </div>
                        )}
                    </>
                )}
                {error ? <p role="alert" className="text-sm text-rp-rust">{error}</p> : null}
            </div>
        </RpSheet>
    );
};
