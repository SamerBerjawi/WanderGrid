import React, { useState } from 'react';
import type { WorkspaceSettings } from '../../../types';
import { dataService } from '../../../services/mockDb';
import { calendarService } from '../../../services/calendarExport';
import { calendarFeedUrl } from '../../../utils/icsContext';
import { errorMessage, toast } from '../../../services/toast';
import type { SettingsData } from '../../../hooks/useSettingsData';
import { StackPanel, type StackPage } from '../../kokonutui/stack-panel';
import SwitchButton from '../../kokonutui/switch-button';
import { RpSection, RpSheet } from '../ui';
import { BASEMAPS, BasemapCard } from '../map/MapSettingsSheet';
import { Airport, Buildings, CalendarBlank, Clock, Copy, CurrencyDollar, DownloadSimple, Gear, MapsGlobal, Moon, Palette, Seat, Sun, Desktop, Train, UserAdd, ArrowsClockwise } from '../../ui/hugeicons';
import { attempt, card, HoldSheet, PaneHeader, TextSheet } from './SettingsParts';

type Theme = 'light' | 'dark' | 'auto';

const CURRENCIES: Array<[string, string]> = [
    ['USD', 'US dollar'], ['EUR', 'Euro'], ['GBP', 'British pound'], ['AUD', 'Australian dollar'], ['CAD', 'Canadian dollar'],
    ['CHF', 'Swiss franc'], ['JPY', 'Japanese yen'], ['CNY', 'Chinese yuan'], ['HKD', 'Hong Kong dollar'], ['SGD', 'Singapore dollar'],
    ['NZD', 'New Zealand dollar'], ['INR', 'Indian rupee'], ['KRW', 'South Korean won'], ['SEK', 'Swedish krona'], ['NOK', 'Norwegian krone'],
    ['DKK', 'Danish krone'], ['PLN', 'Polish zloty'], ['CZK', 'Czech koruna'], ['TRY', 'Turkish lira'], ['AED', 'UAE dirham'],
    ['SAR', 'Saudi riyal'], ['QAR', 'Qatari riyal'], ['EGP', 'Egyptian pound'], ['LBP', 'Lebanese pound'], ['ZAR', 'South African rand'],
    ['BRL', 'Brazilian real'], ['MXN', 'Mexican peso'],
];

const DATE_FORMATS: Array<[string, string]> = [
    ['ddd D MMM, YYYY', 'Mon 21 Sep, 2026'],
    ['MM/DD/YYYY', '09/21/2026'],
    ['DD/MM/YYYY', '21/09/2026'],
    ['YYYY-MM-DD', '2026-09-21'],
];

const CABINS = ['Economy', 'Premium Economy', 'Business', 'First'] as const;
const LAND_MODES = ['Train', 'Bus', 'Car Rental', 'Personal Car', 'Cruise', 'Ferry'] as const;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Monday first, as the week reads.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** The stored basemap names from older versions of the page, mapped to today's. */
const LIGHT_ALIAS: Record<string, string> = { snow: 'positron', ofm_positron: 'positron', ofm_liberty: 'liberty', ofm_bright: 'bright', 'liberty-3d': '3d', vibrant: 'bright' };
const DARK_ALIAS: Record<string, string> = { onyx: 'dark' };
const LIGHT_CHOICES = ['liberty', 'bright', 'positron', 'satellite', '3d'];
const DARK_CHOICES = ['dark', 'fiord', 'citylights', 'satellite', 'ocean'];
const basemapLabel = (id: string) => (id === '3d' ? '3D' : BASEMAPS.find(b => b.value === id)?.label ?? id);

const daysLabel = (days: number[]) => {
    const set = new Set(days);
    if (set.size === 7) return 'Every day';
    if (set.size === 0) return 'None';
    const names = DAY_ORDER.filter(d => set.has(d)).map(d => DAYS[d].slice(0, 3));
    return names.length > 3 ? `${names.length} of 7 days` : names.join(', ');
};

const download = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

/** Default basemaps for light and dark: the Map settings cards, one row of choices for each theme. */
const BasemapSheet: React.FC<{ open: boolean; onClose: () => void; settings: WorkspaceSettings; onPick: (key: 'defaultBasemapLight' | 'defaultBasemapDark', value: string) => void }> = ({ open, onClose, settings, onPick }) => {
    const light = LIGHT_ALIAS[settings.defaultBasemapLight as string] ?? settings.defaultBasemapLight ?? 'liberty';
    const dark = DARK_ALIAS[settings.defaultBasemapDark as string] ?? settings.defaultBasemapDark ?? 'citylights';
    const card3d = BASEMAPS.find(b => b.value === 'liberty');
    const group = (title: string, icon: typeof Sun, choices: string[], current: string, key: 'defaultBasemapLight' | 'defaultBasemapDark') => (
        <RpSection title={title} icon={icon}>
            <div className="grid grid-cols-2 gap-3 py-2 sm:grid-cols-3">
                {choices.map(id => {
                    const b = BASEMAPS.find(x => x.value === id);
                    return (
                        <BasemapCard key={id} label={basemapLabel(id)} hint={id === '3d' ? 'Perspective' : undefined} selected={current === id} onClick={() => onPick(key, id)}>
                            <img src={(b ?? card3d)?.preview} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" style={b?.filter ? { filter: b.filter } : undefined} />
                        </BasemapCard>
                    );
                })}
            </div>
        </RpSection>
    );
    return (
        <RpSheet open={open} onClose={onClose} title="Default basemaps" subtitle="Used when a map is set to Auto." width={460}>
            <div className="flex flex-col gap-4">
                {group('Light theme', Sun, LIGHT_CHOICES, light, 'defaultBasemapLight')}
                {group('Dark theme', Moon, DARK_CHOICES, dark, 'defaultBasemapDark')}
            </div>
        </RpSheet>
    );
};

export const WorkspacePane: React.FC<{
    data: SettingsData;
    theme: Theme;
    isDark: boolean;
    onThemeChange: (theme: Theme) => void;
}> = ({ data, theme, isDark, onThemeChange }) => {
    const { settings, isAdmin } = data;
    const [sheet, setSheet] = useState<'name' | 'airport' | 'basemaps' | 'reset-link' | null>(null);
    if (!settings) return null;

    const change = (changes: Partial<WorkspaceSettings>) => void attempt(() => data.save(changes));
    const days = settings.workingDays ?? [1, 2, 3, 4, 5];
    const dateSample = DATE_FORMATS.find(([f]) => f === settings.dateFormat)?.[1] ?? settings.dateFormat;
    const signupOpen = settings.allowSelfRegistration !== false;
    const light = LIGHT_ALIAS[settings.defaultBasemapLight as string] ?? settings.defaultBasemapLight ?? 'liberty';
    const dark = DARK_ALIAS[settings.defaultBasemapDark as string] ?? settings.defaultBasemapDark ?? 'citylights';
    const currencyName = CURRENCIES.find(([c]) => c === settings.currency)?.[1];

    const exportCalendar = async () => {
        await attempt(async () => {
            const trips = await dataService.getTrips();
            const ics = calendarService.generateIcsContent(trips, settings.orgName || 'WanderGrid', await dataService.getCalendarFeedOptions());
            download(`wandergrid-calendar-${new Date().toISOString().split('T')[0]}.ics`, ics, 'text/calendar');
        }, "The calendar file couldn't be made.");
    };
    const copyLink = async (rotate: boolean) => {
        try {
            const token = rotate ? await dataService.rotateCalendarFeedToken() : await dataService.getCalendarFeedToken();
            await navigator.clipboard.writeText(calendarFeedUrl(window.location.origin, token, await dataService.getCalendarFeedOptions()));
            toast.success(rotate ? 'New link copied. The old one no longer works.' : 'Calendar link copied');
        } catch (e) {
            toast.error(errorMessage(e, "The calendar link couldn't be copied."));
        }
    };

    // Workspace-wide rows are for admins; everyone else sees the value without a way in.
    const wide = <T extends object>(row: T, interactive: Partial<{ to: string; onSelect: () => void }>): T => (isAdmin ? { ...row, ...interactive } : row);

    const choice = <T extends string>(options: ReadonlyArray<readonly [T, string]>, current: T | undefined, apply: (v: T) => void) => ({
        sections: [{
            rows: options.map(([value, label]) => ({
                id: value,
                label,
                selected: current === value,
                onSelect: () => { if (value !== current) apply(value); },
            })),
        }],
    });

    const currencyOptions: Array<readonly [string, string]> = CURRENCIES.map(([c, n]) => [c, `${c} · ${n}`] as const);
    if (!CURRENCIES.some(([c]) => c === settings.currency)) currencyOptions.push([settings.currency, settings.currency]);

    const pages: Record<string, StackPage> = {
        workspace: {
            title: 'Workspace',
            sections: [
                {
                    title: 'General',
                    rows: [
                        wide({ id: 'name', icon: Buildings, label: 'Name', detail: settings.orgName || 'WanderGrid Workspace' }, { onSelect: () => setSheet('name') }),
                        wide({ id: 'currency', icon: CurrencyDollar, label: 'Currency', detail: settings.currency }, { to: 'currency' }),
                        wide({ id: 'date', icon: CalendarBlank, label: 'Date format', detail: dateSample }, { to: 'date' }),
                        ...(isAdmin
                            ? [{ id: 'signup', icon: UserAdd, label: 'Public sign-up', checked: signupOpen, onSelect: () => change({ allowSelfRegistration: !signupOpen }) }]
                            : [{ id: 'signup', icon: UserAdd, label: 'Public sign-up', detail: signupOpen ? 'Open' : 'Closed' }]),
                    ],
                    footer: isAdmin ? 'When public sign-up is open, anyone can create a Partner account.' : 'Only admins change these.',
                },
                {
                    title: 'Appearance',
                    rows: [
                        { id: 'theme', icon: Palette, label: 'Theme', detail: theme === 'auto' ? 'Match device' : theme === 'dark' ? 'Dark' : 'Light', to: 'theme' },
                        wide({ id: 'basemaps', icon: MapsGlobal, label: 'Default basemaps', detail: `${basemapLabel(light)} · ${basemapLabel(dark)}` }, { onSelect: () => setSheet('basemaps') }),
                    ],
                },
                {
                    title: 'Travel defaults',
                    rows: [
                        wide({ id: 'cabin', icon: Seat, label: 'Cabin class', detail: settings.defaultTravelClass || 'Economy' }, { to: 'cabin' }),
                        wide({ id: 'airport', icon: Airport, label: 'Starting airport', detail: settings.defaultStartingAirport || 'None' }, { onSelect: () => setSheet('airport') }),
                        wide({ id: 'land', icon: Train, label: 'Land transport', detail: settings.defaultLandTransportMethod || 'Train' }, { to: 'land' }),
                    ],
                },
                {
                    title: 'Calendar',
                    rows: [
                        wide({ id: 'days', icon: Clock, label: 'Working days', detail: daysLabel(days) }, { to: 'days' }),
                        { id: 'sync', icon: CalendarBlank, label: 'Calendar sync', to: 'sync' },
                    ],
                },
            ],
        },
        currency: {
            title: 'Currency',
            ...choice(currencyOptions, settings.currency, v => change({ currency: v })),
        },
        date: { title: 'Date format', ...choice(DATE_FORMATS, settings.dateFormat, v => change({ dateFormat: v })) },
        theme: {
            title: 'Theme',
            sections: [{
                rows: ([['light', 'Light', Sun], ['dark', 'Dark', Moon], ['auto', 'Match device', Desktop]] as const).map(([value, label, icon]) => ({
                    id: value, icon, label, selected: theme === value, onSelect: () => { if (value !== theme) onThemeChange(value); },
                })),
                footer: 'Only for you, on this device.',
            }],
        },
        cabin: { title: 'Cabin class', ...choice(CABINS.map(c => [c, c] as const), settings.defaultTravelClass || 'Economy', v => change({ defaultTravelClass: v })) },
        land: { title: 'Land transport', ...choice(LAND_MODES.map(m => [m, m] as const), (settings.defaultLandTransportMethod || 'Train') as string, v => change({ defaultLandTransportMethod: v as WorkspaceSettings['defaultLandTransportMethod'] })) },
        days: {
            title: 'Working days',
            sections: [{
                rows: DAY_ORDER.map(d => ({
                    id: String(d),
                    label: DAYS[d],
                    checked: days.includes(d),
                    onSelect: () => change({ workingDays: days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort() }),
                })),
                footer: 'Leave days count only on these days.',
            }],
        },
        sync: {
            title: 'Calendar sync',
            sections: [
                {
                    rows: [
                        { id: 'ics', icon: DownloadSimple, label: 'Download calendar file', onSelect: () => void exportCalendar() },
                        { id: 'copy', icon: Copy, label: 'Copy subscription link', onSelect: () => void copyLink(false) },
                    ],
                    footer: 'Your link is private: anyone with it can read what it syncs. Choose what it holds under Calendar › Options › What to sync.',
                },
                { rows: [{ id: 'reset', icon: ArrowsClockwise, label: 'Reset link', tone: 'danger' as const, onSelect: () => setSheet('reset-link') }] },
            ],
        },
    };

    return (
        <section aria-label="Workspace">
            <PaneHeader
                icon={Gear}
                title="Workspace"
                actions={
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-rp-muted">{isDark ? 'Dark' : 'Light'}</span>
                        <SwitchButton theme={isDark ? 'dark' : 'light'} onThemeChange={t => onThemeChange(t)} showLabel={false} aria-label="Switch between light and dark" />
                    </div>
                }
            />
            <div className={`${card} p-2 sm:p-3`}>
                <StackPanel pages={pages} root="workspace" bare />
            </div>

            <TextSheet
                open={sheet === 'name'}
                title="Workspace name"
                label="Name"
                icon={Buildings}
                value={settings.orgName || ''}
                placeholder="WanderGrid Workspace"
                onClose={() => setSheet(null)}
                onSave={async v => { await data.save({ orgName: v }); }}
            />
            <TextSheet
                open={sheet === 'airport'}
                title="Starting airport"
                subtitle="Three-letter IATA code"
                label="Airport"
                icon={Airport}
                value={settings.defaultStartingAirport || ''}
                placeholder="LHR"
                maxLength={3}
                mono
                uppercase
                onClose={() => setSheet(null)}
                onSave={async v => {
                    if (v && !/^[A-Z]{3}$/.test(v)) throw new Error('Use a three-letter airport code, such as LHR.');
                    await data.save({ defaultStartingAirport: v });
                }}
            />
            <BasemapSheet open={sheet === 'basemaps'} onClose={() => setSheet(null)} settings={settings} onPick={(key, value) => change({ [key]: value } as Partial<WorkspaceSettings>)} />
            <HoldSheet
                open={sheet === 'reset-link'}
                title="Reset your calendar link?"
                holdLabel="Hold to reset"
                onClose={() => setSheet(null)}
                onConfirm={async () => { await copyLink(true); }}
            >
                Calendars that use your current link stop updating. The new link is copied for you to share.
            </HoldSheet>
        </section>
    );
};
