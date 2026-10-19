import React, { useId } from 'react';

/** Form field pieces for sheets on the New pages: a pill-shaped input style and a labelled wrapper. */

export const RP_FIELD =
    'min-h-11 w-full rounded-rp-inset bg-rp-surface px-3 text-sm text-rp-ink outline-none placeholder:text-rp-muted focus-visible:ring-2 focus-visible:ring-rp-muted';

export const RpField: React.FC<{ label: string; error?: string; children: (id: string) => React.ReactNode }> = ({ label, error, children }) => {
    const id = useId();
    return (
        <div className="flex flex-col gap-1.5 py-1.5">
            <label htmlFor={id} className="text-xs text-rp-muted">{label}</label>
            {children(id)}
            {error ? <p role="alert" className="text-xs text-rp-rust">{error}</p> : null}
        </div>
    );
};
