import React from 'react';
import { ArrowLeft } from '../ui/hugeicons';
import { RpEmpty } from './ui';

/** Shown inside the shell for a path nothing handles (a typo, a removed page, a stale bookmark). */
export const NotFoundNew: React.FC<{ onHome: () => void }> = ({ onHome }) => (
    <div className="px-3 pt-2 sm:px-6">
        <div className="mx-auto w-full max-w-[1180px] rounded-rp-card bg-rp-surface rp-shadow-rest">
            <RpEmpty
                title="Page not found"
                action={
                    <button type="button" onClick={onHome} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink outline-none focus-visible:ring-2 focus-visible:ring-rp-muted focus-visible:ring-offset-2 focus-visible:ring-offset-rp-surface">
                        <ArrowLeft size={16} aria-hidden /> Back to dashboard
                    </button>
                }
            >
                The link may be wrong, or the page may have moved.
            </RpEmpty>
        </div>
    </div>
);
