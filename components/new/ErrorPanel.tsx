import React, { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, Check, Copy, SquaresFour, Warning } from '../ui/hugeicons';
import { cn } from '../../utils/cn';
import { APP_VERSION } from '../../version';
import './new.css';

/**
 * The "something went wrong" screen, in the New pages' look: a calm card with what happened in plain
 * words, the actions that help, and the technical message folded away (with Copy for a bug report).
 * Used by both error boundaries. A stale or missing script (a new version was deployed, or the dev server
 * restarted) reads differently from a crash, because the fix is just a reload.
 */

const BTN = 'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-surface active:scale-[0.97]';

export const isStaleScript = (error: Error | null): boolean => /dynamically imported module|importing a module script|Loading chunk|Unable to preload/i.test(error?.message || '');

/**
 * What may be shown or copied about an error: the message only (never a stack), on one line, with web
 * addresses reduced to their host, file paths dropped and a length cap. In development the raw name stays.
 */
export const safeErrorDetail = (error: Error | null): string => {
    if (!error) return '';
    const text = (error.message || String(error))
        .replace(/https?:\/\/([^\s/?#]+)[^\s)]*/g, '$1')
        .replace(/(?:[A-Za-z]:)?(?:\/[\w.@-]+){2,}(?::\d+){0,2}/g, '[path]')
        .replace(/\s+/g, ' ')
        .trim();
    const name = error.name && error.name !== 'Error' ? `${error.name}: ` : '';
    return `${name}${text}`.slice(0, 300);
};

export interface ErrorPanelProps {
    error: Error | null;
    /** Full screen (the root boundary) or inside the page area. */
    fullScreen?: boolean;
    onRetry?: () => void;
    onDashboard?: () => void;
    onReload?: () => void;
    /** An extra step, such as clearing cached data. */
    extra?: React.ReactNode;
    notice?: React.ReactNode;
}

export const ErrorPanel: React.FC<ErrorPanelProps> = ({ error, fullScreen, onRetry, onDashboard, onReload, extra, notice }) => {
    const [copied, setCopied] = useState(false);
    const stale = isStaleScript(error);
    const detail = safeErrorDetail(error);
    const heading = useRef<HTMLHeadingElement>(null);
    // The page behind is gone: move focus to the message so a screen reader reads it and Tab starts at the actions.
    useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
    const copy = async () => {
        const report = `${detail}\nPage: ${window.location.pathname}\nWanderGrid ${APP_VERSION}\n${new Date().toISOString()}`;
        try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard unavailable */ }
    };

    return (
        <div id="app-error-boundary-container" className={cn('rp-root flex w-full items-center justify-center p-4 sm:p-6', fullScreen ? 'min-h-screen bg-rp-canvas' : 'min-h-[28rem]')}>
            <div id="app-error-boundary-card" role="alert" className="flex w-full max-w-lg flex-col items-center gap-5 rounded-rp-card bg-rp-surface p-6 text-center text-rp-ink rp-shadow-rest sm:p-8">
                <span id="app-error-boundary-icon-bg" className="flex size-14 items-center justify-center rounded-full bg-rp-rust/15 text-rp-rust">
                    <Warning size={26} aria-hidden />
                </span>
                <div className="flex flex-col gap-2">
                    <h2 ref={heading} tabIndex={-1} id="app-error-boundary-title" className="text-2xl outline-none font-medium tracking-tight text-rp-ink">
                        {stale ? 'This page needs a refresh' : 'This page ran into a problem'}
                    </h2>
                    <p id="app-error-boundary-description" className="mx-auto max-w-sm text-sm leading-relaxed text-rp-muted">
                        {stale
                            ? 'A part of the page could not be loaded. WanderGrid was probably updated while this tab was open. Reloading fetches the latest version; your trips are not affected.'
                            : 'Something broke while showing this section. The rest of WanderGrid is fine, and your trips are safe. Try again, or go back to the dashboard.'}
                    </p>
                </div>

                {notice}

                <div className="flex w-full flex-col gap-2 sm:flex-row">
                    {stale || !onRetry ? (
                        <button type="button" id="error-boundary-refresh" onClick={onReload ?? (() => window.location.reload())} className={cn(BTN, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}>
                            <ArrowCounterClockwise size={16} aria-hidden /> Reload page
                        </button>
                    ) : (
                        <button type="button" id="app-error-boundary-retry-btn" onClick={onRetry} className={cn(BTN, 'bg-rp-ink text-rp-on-ink hover:bg-rp-ink/90')}>
                            <ArrowCounterClockwise size={16} aria-hidden /> Try again
                        </button>
                    )}
                    {onDashboard ? (
                        <button type="button" id="app-error-boundary-dashboard-btn" onClick={onDashboard} className={cn(BTN, 'bg-rp-inset text-rp-ink hover:bg-rp-line')}>
                            <SquaresFour size={16} aria-hidden /> Dashboard
                        </button>
                    ) : null}
                </div>
                {extra}

                {detail ? (
                    <details id="app-error-boundary-debug" className="group w-full rounded-rp-inset bg-rp-inset text-left">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium text-rp-ink outline-none focus-visible:ring-2 focus-visible:ring-rp-muted [&::-webkit-details-marker]:hidden">
                            Technical details
                            <span className="text-rp-muted transition-transform group-open:rotate-180" aria-hidden>⌄</span>
                        </summary>
                        <div className="flex flex-col gap-3 px-4 pb-4">
                            <p className="max-h-32 overflow-auto font-mono text-xs leading-normal break-words text-rp-rust">{detail}</p>
                            <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-rp-surface px-4 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                                {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {copied ? 'Copied' : 'Copy details'}
                            </button>
                        </div>
                    </details>
                ) : null}
            </div>
        </div>
    );
};
