import React, { useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { loadHugeicons, searchHugeicons, iconSearchKey, type HugeiconLibrary } from '../../utils/hugeiconsLibrary';
import { MagnifyingGlass, X } from '../ui/hugeicons';
import { RP_FIELD } from './fields';
import { cn } from '../../utils/cn';

/**
 * Icon finder: search the whole Hugeicons free set by name and pick one. Used for a trip's icon; the
 * value is the icon's export name (e.g. "Airplane01Icon"). Suggestions show until something is typed.
 */

const SUGGESTED = [
    'Airplane01Icon', 'Luggage01Icon', 'Sun01Icon', 'MountainIcon', 'BeachIcon', 'TentIcon', 'CarIcon', 'TrainIcon',
    'ShipIcon', 'Hotel01Icon', 'CameraIcon', 'Backpack01Icon', 'Compass01Icon', 'IslandIcon', 'RestaurantIcon', 'Passport01Icon',
];

export const IconPicker: React.FC<{ value?: string; onChange: (name: string | undefined) => void }> = ({ value, onChange }) => {
    const [lib, setLib] = useState<HugeiconLibrary | null>(null);
    const [failed, setFailed] = useState(false);
    const [query, setQuery] = useState('');

    useEffect(() => {
        let live = true;
        loadHugeicons().then(l => { if (live) setLib(l); }).catch(() => { if (live) setFailed(true); });
        return () => { live = false; };
    }, []);

    const names = useMemo(() => (lib ? Object.keys(lib) : []), [lib]);
    const results = useMemo(() => {
        if (!lib) return [];
        if (!query.trim()) return SUGGESTED.filter(n => lib[n]);
        return searchHugeicons(names, query);
    }, [lib, names, query]);

    return (
        <div className="flex flex-col gap-2 py-2">
            <label className="relative flex items-center">
                <span className="sr-only">Search icons</span>
                <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 text-rp-muted" aria-hidden />
                <input
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={lib ? `Search ${names.length.toLocaleString('en-US')} icons` : 'Loading icons…'}
                    disabled={!lib}
                    className={cn(RP_FIELD, 'pl-9 [&::-webkit-search-cancel-button]:hidden')}
                />
                {query ? (
                    <button type="button" aria-label="Clear icon search" onClick={() => setQuery('')} className="absolute right-0 flex size-11 items-center justify-center rounded-full text-rp-muted hover:text-rp-ink">
                        <X size={16} />
                    </button>
                ) : null}
            </label>
            {failed ? <p role="alert" className="text-xs text-rp-rust">Couldn't load the icons. Check your connection and try again.</p> : null}
            {lib && results.length === 0 ? <p className="px-1 text-xs text-rp-muted">No icons match "{query}".</p> : null}
            {lib && results.length > 0 ? (
                <div role="listbox" aria-label="Icons" className="grid max-h-56 grid-cols-6 gap-1.5 overflow-y-auto custom-scrollbar sm:grid-cols-7">
                    {results.map(name => (
                        <button
                            key={name}
                            type="button"
                            role="option"
                            aria-selected={value === name}
                            aria-label={iconSearchKey(name)}
                            title={iconSearchKey(name)}
                            onClick={() => onChange(value === name ? undefined : name)}
                            className={cn(
                                'flex size-11 items-center justify-center rounded-rp-inset outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted',
                                value === name ? 'bg-rp-ink text-rp-on-ink' : 'bg-rp-surface text-rp-ink hover:bg-rp-line'
                            )}
                        >
                            <HugeiconsIcon icon={lib[name]} size={20} strokeWidth={1.5} color="currentColor" aria-hidden />
                        </button>
                    ))}
                </div>
            ) : null}
            {value ? (
                <button type="button" onClick={() => onChange(undefined)} className="self-start rounded-full px-1 text-xs text-rp-muted underline-offset-4 hover:text-rp-ink hover:underline min-h-11">
                    Use the default icon
                </button>
            ) : null}
        </div>
    );
};
