import React, { useEffect, useMemo, useState } from 'react';
import type { SavedConfig } from '../../../types';
import { fetchHolidayCountries, fetchHolidays, fetchRegions, type RegionOption } from '../../../services/holidayCalendars';
import { buildConfig, configId, matchCountries, offeredYears, type CountryOption } from '../../../utils/holidayCalendar';
import { errorMessage } from '../../../services/toast';
import ParticleButton from '../../kokonutui/particle-button';
import { Check, MagnifyingGlass, Plus } from '../../ui/hugeicons';
import { RP_FIELD } from '../fields';
import { RpChip } from '../ui';
import { cn } from '../../../utils/cn';

/**
 * Adds a country's public holidays as a saved calendar: pick a country (searched by name or code), optionally one of
 * its regions (its own holidays are added to the country's), and a year. Other regions' days are left out and
 * counted. A calendar that is already saved is refreshed, keeping its day-off switches and the days added by hand.
 */

export const AddCalendar: React.FC<{
    thisYear: number;
    initialYear: number;
    saved: SavedConfig[];
    /** Saves the calendar (and follows it for the member when they already follow others). */
    onAdd: (config: SavedConfig, regionalSkipped: number) => Promise<void>;
}> = ({ thisYear, initialYear, saved, onAdd }) => {
    const [open, setOpen] = useState(false);
    const [countries, setCountries] = useState<CountryOption[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [country, setCountry] = useState<CountryOption | null>(null);
    const [year, setYear] = useState(initialYear);
    const [regions, setRegions] = useState<RegionOption[] | null>(null);
    const [region, setRegion] = useState<RegionOption | null>(null);

    useEffect(() => { setYear(initialYear); }, [initialYear]);
    useEffect(() => {
        if (!open || countries) return;
        let cancelled = false;
        fetchHolidayCountries()
            .then(c => { if (!cancelled) { setCountries(c); setLoadError(null); } })
            .catch(e => { if (!cancelled) setLoadError(errorMessage(e, "Couldn't load the list of countries.")); });
        return () => { cancelled = true; };
    }, [open, countries]);

    // A country's regions, for regional holidays (optional: the whole country is the default).
    useEffect(() => {
        setRegion(null);
        setRegions(null);
        if (!country) return;
        let cancelled = false;
        fetchRegions(country.code).then(r => { if (!cancelled) setRegions(r); }).catch(() => { if (!cancelled) setRegions([]); });
        return () => { cancelled = true; };
    }, [country]);

    const matches = useMemo(() => (countries ? matchCountries(countries, query) : []), [countries, query]);
    const id = country ? configId(country.code, year, region?.code) : '';
    const exists = country ? saved.some(c => c.id === id) : false;
    const tag = country ? (region ? region.code : country.code) : '';
    const years = useMemo(() => [...new Set([...offeredYears(thisYear), initialYear])].sort(), [thisYear, initialYear]);

    const add = async () => {
        if (!country) throw new Error('Choose a country.');
        const answer = await fetchHolidays(country.code, year, region?.code);
        await onAdd(buildConfig(answer, country.name, new Date(), region?.name, saved.find(c => c.id === id)), answer.regionalSkipped ?? 0);
        setCountry(null);
        setRegion(null);
        setQuery('');
    };

    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full bg-rp-inset px-5 text-sm font-medium text-rp-ink outline-none hover:bg-rp-line focus-visible:ring-2 focus-visible:ring-rp-muted">
                <Plus size={16} aria-hidden /> Add a country calendar
            </button>
        );
    }

    return (
        <section aria-label="Add a country calendar" className="flex flex-col gap-3 rounded-rp-inset bg-rp-inset/60 px-4 py-3">
            <h3 className="text-sm font-medium text-rp-ink">Add a country calendar</h3>
            {loadError ? (
                <p role="alert" className="text-sm text-rp-rust">{loadError}</p>
            ) : (
                <>
                    <div className="relative">
                        <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rp-muted" aria-hidden />
                        <label htmlFor="holiday-country" className="sr-only">Country</label>
                        <input
                            id="holiday-country"
                            value={country ? country.name : query}
                            onChange={e => { setCountry(null); setQuery(e.target.value); }}
                            placeholder={countries ? 'Search a country' : 'Loading countries…'}
                            disabled={!countries}
                            autoComplete="off"
                            className={cn(RP_FIELD, 'pl-9')}
                        />
                    </div>
                    {!country && countries ? (
                        matches.length > 0 ? (
                            <ul className="flex flex-col" aria-label="Countries">
                                {matches.map(c => (
                                    <li key={c.code}>
                                        <button type="button" onClick={() => setCountry(c)} className="flex min-h-11 w-full items-center gap-3 rounded-rp-inset px-2 text-left text-sm text-rp-ink outline-none hover:bg-rp-inset focus-visible:ring-2 focus-visible:ring-rp-muted">
                                            <span className="rp-tabular w-7 shrink-0 text-xs text-rp-muted">{c.code}</span>
                                            <span className="min-w-0 flex-1 truncate">{c.name}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="px-1 text-sm text-rp-muted">No country matches "{query}".</p>
                        )
                    ) : null}
                    {country && regions && regions.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="holiday-region" className="text-xs text-rp-muted">Region (adds its own holidays)</label>
                            <select
                                id="holiday-region"
                                value={region?.code ?? ''}
                                onChange={e => setRegion(regions.find(x => x.code === e.target.value) ?? null)}
                                className={RP_FIELD}
                            >
                                <option value="">The whole country</option>
                                {regions.map(x => <option key={x.code} value={x.code}>{x.name === x.code ? x.code : `${x.name} (${x.code})`}</option>)}
                            </select>
                        </div>
                    ) : null}
                    <div role="group" aria-label="Year" className="-m-3 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]">
                        {years.map(y => <RpChip key={y} selected={y === year} onClick={() => setYear(y)} className="rp-tabular">{y}</RpChip>)}
                    </div>
                </>
            )}
            <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-rp-muted outline-none hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted">Close</button>
                <ParticleButton onClick={add} disabled={!country || Boolean(loadError)} pendingLabel="Fetching" successLabel={exists ? 'Refreshed' : 'Added'} errorLabel="Try again">
                    {exists ? <><Check size={16} aria-hidden /> Refresh {tag} {year}</> : <><Plus size={16} aria-hidden /> Add {country ? `${tag} ${year}` : 'calendar'}</>}
                </ParticleButton>
            </div>
        </section>
    );
};
