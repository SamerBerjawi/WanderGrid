import React, { useState } from 'react';
import { clsx } from 'clsx';
import {
  Gear, Users, Plugs, SuitcaseSimple, Airplane, Database, Sparkle, Plus, Check, MagnifyingGlass as Search,
  PencilSimpleLine as Edit3, Trash as Trash2, Eye, EyeSlash, MapPin, Globe, Compass, ArrowSquareOut, DownloadSimple,
  UploadSimple, CalendarBlank, Warning, Copy, Car, ArrowsMerge, ArrowsClockwise, Key, ArrowLeft, CaretRight, Sun, Moon,
} from '@/components/ui/hugeicons';
import { Modal } from '../../components/ui';
import { GlassSelect } from '../../components/glass/GlassSelect';
import { GearSettingsTab } from '../../components/GearSettingsTab';
import { CarriersTab } from '../../components/CarriersTab';
import { GhPage, GhCard, GhButton, GhChip, GhEmpty, GhTone } from '../../components/golden/Gh';
import { SunsetScene } from '../../components/golden/SunsetScene';
import { GhSection } from '../../components/golden/GhSection';
import { GhSettingRow } from '../../components/golden/GhSettingRow';
import { GhSegmented } from '../../components/golden/GhSegmented';
import { GhToggle } from '../../components/golden/GhToggle';
import { GhTextInput } from '../../components/golden/GhTextInput';
import { useSettingsController } from '../../hooks/useSettingsController';
import { isFeatureEnabled, FEATURE_FLAGS } from '../../config/featureFlags';
import { formatDate } from '../../utils/formatters';
import type { BackupSelectionOptions } from '../../types';
import type { GoldenViewProps } from './registry';

type Section = 'workspace' | 'personnel' | 'integrations' | 'gear' | 'carriers' | 'data';

const CATEGORIES: { key: keyof BackupSelectionOptions; label: string; subtitle: string; icon: React.ReactNode }[] = [
  { key: 'flights', label: 'Flights', subtitle: 'Air trips, bookings and legs', icon: <Airplane className="w-5 h-5" /> },
  { key: 'roadTrips', label: 'Road trips and overland', subtitle: 'Drives, trains, ferries, rentals', icon: <Car className="w-5 h-5" /> },
  { key: 'visited', label: 'Travel atlas', subtitle: 'Visited cities and countries', icon: <MapPin className="w-5 h-5" /> },
  { key: 'users', label: 'Members', subtitle: 'Profiles and leave balances', icon: <Users className="w-5 h-5" /> },
  { key: 'calendar', label: 'Calendar and entitlements', subtitle: 'Events, holidays, leave policies', icon: <CalendarBlank className="w-5 h-5" /> },
  { key: 'settings', label: 'Workspace settings', subtitle: 'Theme, currency, integrations', icon: <Gear className="w-5 h-5" /> },
];
const ALL_ON = { flights: true, roadTrips: true, visited: true, settings: true, users: true, calendar: true };
const ALL_OFF = { flights: false, roadTrips: false, visited: false, settings: false, users: false, calendar: false };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LIGHT_MAPS = [
  { value: 'liberty', label: 'Liberty' }, { value: 'bright', label: 'Bright' }, { value: 'positron', label: 'Positron' },
  { value: '3d', label: '3D' }, { value: 'satellite', label: 'Satellite' },
];
const DARK_MAPS = [
  { value: 'dark', label: 'Dark' }, { value: 'fiord', label: 'Fiord' }, { value: 'citylights', label: 'NASA' },
  { value: 'satellite', label: 'Satellite' }, { value: 'ocean', label: 'Ocean' },
];
const PROVIDERS = [
  { key: 'adsbdb', name: 'ADSBdb flight telemetry', docs: 'https://adsbdb.com' },
  { key: 'osrm', name: 'FOSSGIS road routing', docs: 'https://routing.openstreetmap.de' },
  { key: 'geocoding', name: 'Open-Meteo geocoding', docs: 'https://open-meteo.com/en/docs/geocoding-api' },
  { key: 'openfreemap', name: 'OpenFreeMap tiles', docs: 'https://openfreemap.org' },
  { key: 'gibs', name: 'NASA GIBS satellite', docs: 'https://earthdata.nasa.gov/eosdis' },
];

const roleTone = (role?: string): GhTone => (role === 'Admin' ? 'coral' : role === 'Partner' ? 'lilac' : 'teal');

/** Golden Hour redesign of the Settings page: a hub of coloured tiles that open into clean sections. */
export const GoldenSettings: React.FC<GoldenViewProps> = ({ onThemeChange }) => {
  const s = useSettingsController(onThemeChange);
  const { config, setConfig } = s;
  const [section, setSection] = useState<Section | null>(null);

  if (s.loading) {
    return (
      <GhPage title="Your settings" icon={<Gear className="w-8 h-8" />}>
        <div role="status" className="rounded-3xl bg-sunset-sand dark:bg-sunset-dusk p-10 text-center font-black text-sunset-ink dark:text-white">Packing your settings…</div>
      </GhPage>
    );
  }

  const tiles: { id: Section; title: string; hint: string; tone: GhTone; icon: React.ReactNode; badge?: string }[] = [
    { id: 'workspace', title: 'Workspace', hint: 'Name, look, defaults', tone: 'coral', icon: <Gear className="w-7 h-7" /> },
    { id: 'personnel', title: 'Members', hint: 'Who travels with you', tone: 'lilac', icon: <Users className="w-7 h-7" />, badge: String(s.users.length) },
    { id: 'integrations', title: 'Integrations', hint: 'Keys and live data', tone: 'teal', icon: <Plugs className="w-7 h-7" />, badge: s.isGeminiActive ? 'Live' : undefined },
    { id: 'gear', title: 'Gear', hint: 'Master packing list', tone: 'sun', icon: <SuitcaseSimple className="w-7 h-7" />, badge: String(config.masterPackingList?.length || 0) },
    { id: 'carriers', title: 'Carriers', hint: 'Airlines and operators', tone: 'sun', icon: <Airplane className="w-7 h-7" />, badge: String(config.carriers?.length || 0) },
    { id: 'data', title: 'Data', hint: 'Backups and calendar', tone: 'ink', icon: <Database className="w-7 h-7" /> },
  ];
  const current = tiles.find(t => t.id === section);

  const saveButton = (
    <div className="flex items-center gap-2">
      {s.saveToast && <GhChip tone="teal"><Check className="w-3.5 h-3.5" /> Saved</GhChip>}
      <GhButton onClick={s.handleSaveOrgSettings} icon={<Check className="w-4 h-4" />} label="Save settings">
        {s.isSavingOrg ? 'Saving…' : 'Save'}
      </GhButton>
    </div>
  );

  const keyField = (id: string, label: string, value: string | undefined, placeholder: string, onChange: (v: string) => void) => (
    <GhTextInput
      label={label}
      mono
      type={s.visibleKeys[id] ? 'text' : 'password'}
      placeholder={placeholder}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      trailing={
        <button type="button" onClick={() => s.toggleKeyVisibility(id)} aria-label={`Toggle ${label} visibility`} className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer text-sunset-ink dark:text-white">
          {s.visibleKeys[id] ? <EyeSlash className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      }
    />
  );

  const docsLink = (href: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Open documentation" className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-full text-sunset-coral">
      <ArrowSquareOut className="w-5 h-5" />
    </a>
  );

  const mapPicker = (label: string, icon: React.ReactNode, opts: { value: string; label: string }[], isSel: (v: string) => boolean, pick: (v: string) => void) => (
    <div>
      <div className="flex items-center gap-2 mb-2 text-sm font-black text-sunset-ink dark:text-white">{icon}{label}</div>
      <div className="flex flex-wrap gap-2">
        {opts.map(o => (
          <button key={o.value} type="button" onClick={() => pick(o.value)} aria-pressed={isSel(o.value)}
            className={clsx('min-h-[44px] px-5 rounded-full text-sm font-semibold cursor-pointer transition-colors',
              isSel(o.value) ? 'bg-sunset-teal text-sunset-ink' : 'bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white')}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );

  const lightVal = config.defaultBasemapLight as string;
  const lightSel = (v: string) =>
    (lightVal || 'liberty') === v || (v === 'positron' && (lightVal === 'snow' || lightVal === 'ofm_positron')) ||
    (v === 'liberty' && lightVal === 'ofm_liberty') || (v === 'bright' && lightVal === 'ofm_bright') || (v === '3d' && lightVal === 'liberty-3d');
  const darkSel = (v: string) => (config.defaultBasemapDark || 'dark') === v || (v === 'dark' && config.defaultBasemapDark === 'onyx');

  const renderWorkspace = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      <GhSection title="Identity" icon={<Gear className="w-5 h-5" />} tone="coral">
        <div className="flex flex-col gap-4">
          <GhTextInput label="Workspace name" placeholder="WanderGrid Workspace" value={config.orgName} onChange={e => setConfig({ ...config, orgName: e.target.value })} />
          <GlassSelect label="Currency" value={config.currency} onChange={e => setConfig({ ...config, currency: e.target.value })}>
            <option value="USD">USD ($) US dollar</option>
            <option value="EUR">EUR (€) Euro</option>
            <option value="GBP">GBP (£) British pound</option>
            <option value="AUD">AUD ($) Australian dollar</option>
            <option value="CAD">CAD ($) Canadian dollar</option>
            <option value="CHF">CHF (Fr) Swiss franc</option>
            <option value="JPY">JPY (¥) Japanese yen</option>
            <option value="AED">AED (د.إ) UAE dirham</option>
            <option value="SGD">SGD ($) Singapore dollar</option>
          </GlassSelect>
          <GlassSelect label="Date format" value={config.dateFormat || 'ddd D MMM, YYYY'} onChange={e => setConfig({ ...config, dateFormat: e.target.value })}>
            <option value="ddd D MMM, YYYY">Mon 21 Sep, 2026 (default)</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY (05/25/2026)</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY (25/05/2026)</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD (2026-05-25)</option>
          </GlassSelect>
        </div>
      </GhSection>

      <GhSection title="Look and access" icon={<Sun className="w-5 h-5" />} tone="sun">
        <GhSettingRow title="Theme" stack>
          <GhSegmented fill label="Theme" value={config.theme} onChange={v => setConfig({ ...config, theme: v })}
            options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light', icon: <Sun className="w-4 h-4" /> }, { value: 'dark', label: 'Dark', icon: <Moon className="w-4 h-4" /> }]} />
        </GhSettingRow>
        <GhSettingRow title="Open sign-up" hint="Anyone can create a Partner account">
          <GhToggle label="Open sign-up" checked={config.allowSelfRegistration !== false} onChange={v => setConfig({ ...config, allowSelfRegistration: v })} />
        </GhSettingRow>
      </GhSection>

      <GhSection title="Travel defaults" icon={<Airplane className="w-5 h-5" />} tone="teal">
        <div className="flex flex-col gap-4">
          <GhSettingRow title="Cabin" stack>
            <GhSegmented wrap label="Default cabin class" value={config.defaultTravelClass || 'Economy'} onChange={v => setConfig({ ...config, defaultTravelClass: v as any })}
              options={['Economy', 'Premium Economy', 'Business', 'First'].map(v => ({ value: v, label: v }))} />
          </GhSettingRow>
          <GhTextInput label="Home airport (IATA)" mono maxLength={3} placeholder="LAX, LHR, SYD" value={config.defaultStartingAirport || ''}
            onChange={e => setConfig({ ...config, defaultStartingAirport: e.target.value.toUpperCase() })} className="uppercase" />
          <GhSettingRow title="Ground transport" stack>
            <GhSegmented wrap label="Default land transport" value={config.defaultLandTransportMethod || 'Train'} onChange={v => setConfig({ ...config, defaultLandTransportMethod: v as any })}
              options={['Train', 'Bus', 'Car Rental', 'Personal Car', 'Cruise', 'Ferry'].map(v => ({ value: v, label: v }))} />
          </GhSettingRow>
        </div>
      </GhSection>

      <GhSection title="Work week" icon={<CalendarBlank className="w-5 h-5" />} tone="lilac" action={<GhChip tone="sun">{config.workingDays.length} of 7</GhChip>}>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {DAYS.map((d, i) => {
            const on = config.workingDays.includes(i);
            return (
              <button key={d} type="button" onClick={() => s.toggleWorkingDay(i)} aria-label={d} aria-pressed={on}
                className={clsx('min-h-[48px] rounded-2xl text-sm font-black cursor-pointer transition-colors', on ? 'bg-sunset-coral text-white' : 'bg-sunset-sand dark:bg-sunset-dusk text-sunset-ink dark:text-white')}>
                {d[0]}
              </button>
            );
          })}
        </div>
      </GhSection>

      <GhSection title="Default maps" icon={<Globe className="w-5 h-5" />} tone="teal" className="lg:col-span-2">
        <div className="flex flex-col gap-6">
          {mapPicker('Light mode', <Sun className="w-4 h-4" />, LIGHT_MAPS, lightSel, v => setConfig({ ...config, defaultBasemapLight: v as any }))}
          {mapPicker('Dark mode', <Moon className="w-4 h-4" />, DARK_MAPS, darkSel, v => setConfig({ ...config, defaultBasemapDark: v as any }))}
        </div>
      </GhSection>
    </div>
  );

  const renderPersonnel = () => (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1 sm:max-w-md">
          <GhTextInput aria-label="Search members" placeholder="Search by name, email or role" value={s.rosterSearch} onChange={e => s.setRosterSearch(e.target.value)} />
        </div>
        <GhButton onClick={s.handleCreateUser} icon={<Plus className="w-4 h-4" />}>Add member</GhButton>
      </div>
      {s.filteredUsers.length === 0 ? (
        <GhEmpty title="Nobody here yet" hint="Try another search or add a member." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {s.filteredUsers.map(u => (
            <div key={u.id || u.email} className="rounded-3xl bg-white dark:bg-sunset-plum shadow-card p-5 text-sunset-ink dark:text-white flex flex-col gap-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={clsx('w-12 h-12 rounded-full flex items-center justify-center font-black text-lg shrink-0 text-sunset-ink',
                    roleTone(u.role) === 'coral' ? 'bg-sunset-orange text-white' : roleTone(u.role) === 'lilac' ? 'bg-sunset-lilac' : 'bg-sunset-teal')}>
                    {u.name?.charAt(0) || '?'}
                  </span>
                  <div className="min-w-0">
                    <div className="font-black truncate">{u.name}</div>
                    <div className="text-sm opacity-70 truncate">{u.email || 'No email'}</div>
                  </div>
                </div>
                <div className="flex shrink-0">
                  {isFeatureEnabled('AUDIT_PASSWORD_RESET') && (
                    <button type="button" onClick={() => s.handleIssueResetCode(u)} aria-label={`Issue password reset code for ${u.name}`} className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer hover:bg-sunset-sand dark:hover:bg-sunset-dusk"><Key className="w-5 h-5" /></button>
                  )}
                  <button type="button" onClick={() => s.handleEditUser(u)} aria-label={`Edit ${u.name}`} className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer hover:bg-sunset-sand dark:hover:bg-sunset-dusk"><Edit3 className="w-5 h-5" /></button>
                  {u.id !== s.sessionUserId && (
                    <button type="button" onClick={() => { s.setDeleteMemberError(''); s.setMemberToDelete(u); }} aria-label={`Delete ${u.name}`} className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer text-sunset-coral hover:bg-sunset-sand dark:hover:bg-sunset-dusk"><Trash2 className="w-5 h-5" /></button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <GhChip tone={roleTone(u.role)}>{u.role}</GhChip>
                {u.passwordResetRequired && <GhChip tone="coral">Needs password</GhChip>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-sunset-sun text-sunset-ink p-3"><div className="text-2xs font-bold uppercase tracking-wider opacity-80">Balance</div><div className="text-2xl font-black">{u.leaveBalance}<span className="text-sm font-semibold"> days</span></div></div>
                <div className="rounded-2xl bg-sunset-teal text-sunset-ink p-3"><div className="text-2xs font-bold uppercase tracking-wider opacity-80">Taken</div><div className="text-2xl font-black">{u.takenLeave}<span className="text-sm font-semibold"> days</span></div></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderIntegrations = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
      <GhSection title="Gemini AI" icon={<Sparkle className="w-5 h-5" />} tone="lilac" className="md:col-span-2"
        action={<GhChip tone={s.isGeminiActive ? 'teal' : 'coral'}>{s.hasUserKey ? 'Key set' : s.hasEnvKey ? 'Active (host)' : 'Off'}</GhChip>}>
        <div className="max-w-xl">{keyField('gemini', 'Gemini API key', config.googleGeminiApiKey, 'Paste Gemini API key', v => setConfig({ ...config, googleGeminiApiKey: v }))}</div>
      </GhSection>
      <GhSection title="AviationStack" icon={<Airplane className="w-5 h-5" />} tone="sun" action={docsLink('https://aviationstack.com')}>
        {keyField('aviation', 'API key', config.aviationStackApiKey, 'Paste AviationStack key', v => setConfig({ ...config, aviationStackApiKey: v }))}
      </GhSection>
      <GhSection title="AeroDataBox" icon={<Database className="w-5 h-5" />} tone="teal" action={docsLink('https://aerodatabox.com')}>
        <div className="flex flex-col gap-4">
          <GhSegmented fill label="Gateway" value={(config.aeroDataBoxEndpoint || 'rapidapi') as 'rapidapi' | 'direct'} onChange={v => setConfig({ ...config, aeroDataBoxEndpoint: v })}
            options={[{ value: 'rapidapi', label: 'RapidAPI' }, { value: 'direct', label: 'Direct' }]} />
          {keyField('aerodatabox', 'API key', config.aeroDataBoxApiKey, config.aeroDataBoxEndpoint === 'direct' ? 'Paste direct key' : 'Paste RapidAPI key', v => setConfig({ ...config, aeroDataBoxApiKey: v }))}
        </div>
      </GhSection>
      <GhSection title="OpenAIP charts" icon={<Compass className="w-5 h-5" />} tone="teal" action={docsLink('https://www.openaip.net')}>
        {keyField('openaip', 'API key', config.openAipApiKey, 'Paste OpenAIP key', v => setConfig({ ...config, openAipApiKey: v }))}
      </GhSection>
      <GhSection title="Brandfetch" icon={<Globe className="w-5 h-5" />} tone="coral" action={docsLink('https://brandfetch.com/developers')}>
        {keyField('brandfetch', 'Developer API key', config.brandfetchApiKey, 'Paste Brandfetch key', v => setConfig({ ...config, brandfetchApiKey: v }))}
      </GhSection>
      <GhSection title="OpenFreeMap" icon={<MapPin className="w-5 h-5" />} tone="teal" action={docsLink('https://openfreemap.org')} className="md:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <div><div className="font-black">No key needed</div><div className="text-sm opacity-70">Free vector maps, no rate limits.</div></div>
          <GhChip tone="teal">Ready</GhChip>
        </div>
      </GhSection>
      {FEATURE_FLAGS.GEV_P06_INTEGRATIONS && (
        <GhSection title="Live services" icon={<ArrowsClockwise className="w-5 h-5" />} tone="sun" className="md:col-span-2"
          action={<GhButton variant="soft" onClick={s.handleTestAllProviders} icon={<ArrowsClockwise className={clsx('w-4 h-4', s.testingProvider && 'animate-spin')} />}>{s.testingProvider ? 'Testing…' : 'Test all'}</GhButton>}>
          <div className="divide-y divide-sunset-sand dark:divide-sunset-dusk">
            {PROVIDERS.map(p => {
              const r = s.providerResults[p.key];
              const busy = s.testingProvider === p.key;
              return (
                <div key={p.key} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 flex-wrap">
                  <div className="font-black flex items-center gap-1">{p.name}{docsLink(p.docs)}</div>
                  <div className="flex items-center gap-2">
                    {r && <GhChip tone={r.success ? 'teal' : 'coral'}>{r.success ? 'Operational' : 'Unavailable'}{r.latencyMs > 0 && ` · ${r.latencyMs}ms`}</GhChip>}
                    <GhButton variant="soft" label={`Test ${p.name} connection`} onClick={() => s.handleTestProvider(p.key)}>{busy ? '…' : 'Test'}</GhButton>
                  </div>
                </div>
              );
            })}
          </div>
        </GhSection>
      )}
    </div>
  );

  const bigAction = (icon: React.ReactNode, text: string, onClick: () => void, variant: 'primary' | 'soft' = 'soft') => (
    <GhButton variant={variant} onClick={onClick} icon={icon} className="w-full">{text}</GhButton>
  );

  const renderData = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      <GhSection title="Backups" icon={<Database className="w-5 h-5" />} tone="teal">
        <div className="flex flex-col gap-3">
          {bigAction(<DownloadSimple className="w-4 h-4" />, 'Download backup', s.handleExport, 'primary')}
          {bigAction(<UploadSimple className="w-4 h-4" />, 'Restore from file', s.handleImportTrigger)}
          <input type="file" ref={s.fileInputRef} className="hidden" accept=".json" onChange={s.handleFileSelect} />
        </div>
      </GhSection>
      <GhSection title="Import flights" icon={<Airplane className="w-5 h-5" />} tone="lilac">
        {bigAction(<Compass className="w-4 h-4" />, 'Open flight wizard', () => s.setIsFlightWizardOpen(true))}
      </GhSection>
      <GhSection title="Calendar" icon={<CalendarBlank className="w-5 h-5" />} tone="sun">
        <div className="flex flex-col gap-3">
          {bigAction(<DownloadSimple className="w-4 h-4" />, 'Download .ics file', s.handleCalendarExport)}
          {bigAction(s.copiedCalendar ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />, s.copiedCalendar ? 'Link copied' : 'Copy subscription link', s.handleCopySubscriptionLink)}
          {bigAction(<ArrowsClockwise className="w-4 h-4" />, 'Reset subscription link', s.handleResetSubscriptionLink)}
          {s.calendarLinkError && <p role="alert" className="text-sm font-bold text-sunset-coral">{s.calendarLinkError}</p>}
        </div>
      </GhSection>
      <GhSection title="Danger zone" icon={<Warning className="w-5 h-5" />} tone="coral">
        <GhSettingRow title="Wipe everything" hint="Deletes all data. Cannot be undone." stack>
          <GhButton onClick={() => s.setIsResetModalOpen(true)} icon={<Trash2 className="w-4 h-4" />} className="w-full">Wipe and reset</GhButton>
        </GhSettingRow>
      </GhSection>
    </div>
  );

  // ---- Modals (existing Modal shell, golden contents) ----
  const check = (on: boolean, disabled?: boolean) => (
    <span className={clsx('w-7 h-7 rounded-full flex items-center justify-center shrink-0', on && !disabled ? 'bg-sunset-coral text-white' : 'bg-sunset-sand dark:bg-sunset-dusk')}>
      {on && !disabled && <Check className="w-4 h-4" />}
    </span>
  );
  const modalActions = (cancel: () => void, confirm: React.ReactNode) => (
    <div className="flex gap-3 justify-end pt-4 mt-2">
      <GhButton variant="ghost" onClick={cancel}>Cancel</GhButton>
      {confirm}
    </div>
  );
  const linkBtn = (text: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="min-h-[44px] px-2 text-sm font-bold text-sunset-coral cursor-pointer">{text}</button>
  );
  const nBackup = Object.values(s.backupCategories).filter(Boolean).length;
  const nRestore = Object.values(s.restoreCategories).filter(Boolean).length;
  const eu = s.editingUser;

  const modals = (
    <>
      <Modal isOpen={s.isBackupModalOpen} onClose={() => s.setIsBackupModalOpen(false)} title="Download a backup" subtitle="Pick what goes in" icon="database" maxWidth="max-w-xl">
        <div className="flex flex-col gap-3 text-sunset-ink dark:text-white">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">{nBackup} of {CATEGORIES.length} selected</span>
            <span>{linkBtn('Select all', () => s.setBackupCategories({ ...ALL_ON }))}{linkBtn('None', () => s.setBackupCategories({ ...ALL_OFF }))}</span>
          </div>
          <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
            {CATEGORIES.map(c => {
              const on = !!s.backupCategories[c.key];
              const n = s.currentDbStats[c.key];
              return (
                <button key={c.key} type="button" role="checkbox" aria-checked={on} onClick={() => s.setBackupCategories(p => ({ ...p, [c.key]: !p[c.key] }))}
                  className={clsx('min-h-[56px] rounded-2xl p-3 flex items-center gap-3 text-left cursor-pointer', on ? 'bg-sunset-sun text-sunset-ink' : 'bg-sunset-sand dark:bg-sunset-dusk')}>
                  {c.icon}
                  <span className="flex-1 min-w-0"><span className="block font-black truncate">{c.label}</span><span className="block text-xs opacity-80 truncate">{c.subtitle} · {c.key === 'settings' ? (n ? 'configured' : 'default') : `${n} ${n === 1 ? 'item' : 'items'}`}</span></span>
                  {check(on)}
                </button>
              );
            })}
          </div>
          {modalActions(() => s.setIsBackupModalOpen(false),
            <GhButton onClick={s.handleDownloadBackup} icon={<DownloadSimple className="w-4 h-4" />}>{s.isExporting ? 'Exporting…' : `Download (${nBackup})`}</GhButton>)}
        </div>
      </Modal>

      <Modal isOpen={s.isRestoreModalOpen} onClose={() => s.setIsRestoreModalOpen(false)} title="Restore a backup" subtitle={s.pendingFile ? s.pendingFile.name : 'Bring back saved data'} icon="settings_backup_restore" maxWidth="max-w-2xl">
        <div className="flex flex-col gap-4 text-sunset-ink dark:text-white">
          {s.restoreStatus === 'idle' && (
            <>
              {s.detectedRestoreStats && (
                <div className="flex flex-wrap gap-2">
                  {s.detectedRestoreStats.version && <GhChip tone="lilac">v{s.detectedRestoreStats.version}</GhChip>}
                  {s.detectedRestoreStats.timestamp && <GhChip tone="sun">Snapshot {formatDate(s.detectedRestoreStats.timestamp, 'short-with-year')}</GhChip>}
                </div>
              )}
              <GhSegmented<'merge' | 'replace'> fill label="Restore mode" value={s.restoreMode} onChange={s.setRestoreMode}
                options={[{ value: 'merge', label: 'Merge', icon: <ArrowsMerge className="w-4 h-4" /> }, { value: 'replace', label: 'Replace', icon: <ArrowsClockwise className="w-4 h-4" /> }]} />
              <p className="text-sm opacity-80">
                {s.restoreMode === 'merge' ? 'Adds new records and updates matches. Nothing is deleted.' : 'Replaces only the chosen categories. Others stay as they are.'}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">What to restore</span>
                <span>
                  {linkBtn('Everything in file', () => {
                    const d = s.detectedRestoreStats; if (!d) return;
                    s.setRestoreCategories({ flights: d.flights > 0, roadTrips: d.roadTrips > 0, visited: d.visited > 0, users: d.users > 0, calendar: d.calendar > 0, settings: d.settings > 0 });
                  })}
                  {linkBtn('None', () => s.setRestoreCategories({ ...ALL_OFF }))}
                </span>
              </div>
              <div className="flex flex-col gap-2 max-h-[38vh] overflow-y-auto">
                {CATEGORIES.map(c => {
                  const n = s.detectedRestoreStats ? s.detectedRestoreStats[c.key] : 0;
                  const avail = n > 0;
                  const on = !!s.restoreCategories[c.key];
                  return (
                    <button key={c.key} type="button" role="checkbox" aria-checked={on && avail} disabled={!avail}
                      onClick={() => s.setRestoreCategories(p => ({ ...p, [c.key]: !p[c.key] }))}
                      className={clsx('min-h-[56px] rounded-2xl p-3 flex items-center gap-3 text-left', avail ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed', on && avail ? 'bg-sunset-sun text-sunset-ink' : 'bg-sunset-sand dark:bg-sunset-dusk')}>
                      {c.icon}
                      <span className="flex-1 min-w-0"><span className="block font-black truncate">{c.label}</span><span className="block text-xs opacity-80">{avail ? (c.key === 'settings' ? 'Present' : `${n} in file`) : 'Not in file'}</span></span>
                      {check(on, !avail)}
                    </button>
                  );
                })}
              </div>
              {s.restoreMode === 'replace' && <div className="rounded-2xl bg-sunset-sun text-sunset-ink p-3 text-sm font-semibold">Heads up: chosen categories are replaced by the file.</div>}
              {modalActions(() => s.setIsRestoreModalOpen(false),
                <GhButton onClick={s.handleConfirmRestore} icon={s.restoreMode === 'replace' ? <ArrowsClockwise className="w-4 h-4" /> : <ArrowsMerge className="w-4 h-4" />} className={clsx(nRestore === 0 && 'opacity-50 pointer-events-none')}>
                  {s.restoreMode === 'replace' ? 'Overwrite' : 'Merge'} ({nRestore})
                </GhButton>)}
            </>
          )}
          {(s.restoreStatus === 'reading' || s.restoreStatus === 'importing') && <GhEmpty title={s.restoreStatus === 'reading' ? 'Reading file…' : 'Restoring your data…'} />}
          {s.restoreStatus === 'success' && <GhEmpty title="All restored" hint="Reloading…" />}
          {s.restoreStatus === 'error' && (
            <GhEmpty title="That didn't work" hint={s.restoreErrorMessage} action={<GhButton variant="soft" onClick={() => s.setRestoreStatus('idle')}>Try again</GhButton>} />
          )}
        </div>
      </Modal>

      <Modal isOpen={s.isResetModalOpen} onClose={() => { s.setIsResetModalOpen(false); s.setResetConfirmText(''); }} title="Wipe everything" subtitle="This cannot be undone" icon="warning">
        <div className="flex flex-col gap-4 text-sunset-ink dark:text-white">
          <div className="rounded-2xl bg-sunset-orange text-white p-4 text-sm font-semibold">
            All members, calendars, carriers, maps and flights will be deleted for good.
          </div>
          <GhTextInput label="Type DELETE to unlock" mono placeholder="DELETE" value={s.resetConfirmText} onChange={e => s.setResetConfirmText(e.target.value)} className="text-center uppercase tracking-widest" autoFocus />
          {modalActions(() => { s.setIsResetModalOpen(false); s.setResetConfirmText(''); },
            <GhButton onClick={s.handleWipeDatabase} icon={<Trash2 className="w-4 h-4" />} className={clsx(s.resetConfirmText !== 'DELETE' && 'opacity-40 pointer-events-none')}>Wipe database</GhButton>)}
        </div>
      </Modal>

      <Modal isOpen={s.isEditingUser} onClose={() => s.setIsEditingUser(false)} title={eu.id ? 'Edit member' : 'Add member'} subtitle="Sign-in and leave" icon="badge">
        <div className="flex flex-col gap-4 text-sunset-ink dark:text-white">
          <GhTextInput label="Name *" placeholder="Elena Rostova" value={eu.name || ''} onChange={e => s.setEditingUser({ ...eu, name: e.target.value })} autoFocus />
          <GhTextInput label="Email" type="email" placeholder="elena@wandergrid.abc" value={eu.email || ''} onChange={e => s.setEditingUser({ ...eu, email: e.target.value })} />
          <GhTextInput label="Password" type="password" placeholder={eu.id ? 'Leave blank to keep the current one' : 'At least 8 characters'} value={eu.password || ''} onChange={e => s.setEditingUser({ ...eu, password: e.target.value })} />
          <GhSettingRow title="Role" stack>
            <GhSegmented fill label="Role" value={(eu.role || 'Partner') as string} onChange={v => s.setEditingUser({ ...eu, role: v as any })}
              options={[{ value: 'Admin', label: 'Admin' }, { value: 'Partner', label: 'Partner' }, { value: 'Child', label: 'Child' }]} />
          </GhSettingRow>
          <GlassSelect label="Holiday weekend policy" value={eu.holidayWeekendRule || 'none'} onChange={e => s.setEditingUser({ ...eu, holidayWeekendRule: e.target.value as any })}>
            <option value="none">Standard (no override)</option>
            <option value="monday">Cycle Monday policy</option>
            <option value="lieu">Compensate lieu rule</option>
          </GlassSelect>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GhTextInput label="Annual balance (days)" type="number" value={eu.leaveBalance ?? 25} onChange={e => s.setEditingUser({ ...eu, leaveBalance: parseInt(e.target.value) || 0 })} />
            <GhTextInput label="Taken (days)" type="number" value={eu.takenLeave ?? 0} onChange={e => s.setEditingUser({ ...eu, takenLeave: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="rounded-2xl bg-sunset-sand dark:bg-sunset-dusk p-3">
            <div className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2 px-1">Holiday calendars ({s.savedConfigs.length})</div>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {s.savedConfigs.length === 0 && <div className="text-sm text-center py-3 opacity-70">No country calendars saved</div>}
              {s.savedConfigs.map(sc => {
                const ids = eu.holidayConfigIds ?? [];
                const on = ids.includes(sc.id);
                return (
                  <button key={sc.id} type="button" role="checkbox" aria-checked={on} onClick={() => s.setEditingUser({ ...eu, holidayConfigIds: on ? ids.filter(i => i !== sc.id) : [...ids, sc.id] })}
                    className="min-h-[44px] flex items-center gap-3 px-2 rounded-xl text-left cursor-pointer">
                    {check(on)}
                    <span className="text-sm font-bold">{sc.countryName} ({sc.year}) <span className="font-normal opacity-70">· {sc.holidays?.length || 0} holidays</span></span>
                  </button>
                );
              })}
            </div>
          </div>
          {s.memberFormError && <p role="alert" className="text-sm font-bold text-sunset-coral">{s.memberFormError}</p>}
          {modalActions(() => s.setIsEditingUser(false),
            <GhButton onClick={s.handleSaveUser} className={clsx(!eu.name && 'opacity-50 pointer-events-none')}>Save member</GhButton>)}
        </div>
      </Modal>

      <Modal isOpen={!!s.resetCodeInfo} onClose={() => s.setResetCodeInfo(null)} title="Password reset code" subtitle={s.resetCodeInfo ? `For ${s.resetCodeInfo.name}` : ''} icon="key" maxWidth="max-w-md">
        <div className="flex flex-col gap-4 text-sunset-ink dark:text-white">
          <p className="text-sm">
            Share this one-time code with {s.resetCodeInfo?.name}. They pick a new password from <strong>Forgot password?</strong> on the sign-in screen. It works once and expires {s.resetCodeInfo ? formatDate(s.resetCodeInfo.expiresAt, 'short-with-year', config) : ''}.
          </p>
          <p data-testid="reset-code" className="text-center font-mono text-3xl font-black tracking-widest select-all rounded-2xl bg-sunset-sun text-sunset-ink py-4">{s.resetCodeInfo?.code}</p>
          <div className="flex justify-end"><GhButton onClick={() => s.setResetCodeInfo(null)}>Done</GhButton></div>
        </div>
      </Modal>

      <Modal isOpen={!!s.memberToDelete} onClose={() => s.setMemberToDelete(null)} title="Remove member" subtitle="This is permanent" icon="person_remove" maxWidth="max-w-md">
        <div className="flex flex-col gap-4 text-sunset-ink dark:text-white">
          <p className="text-sm">Remove <strong>{s.memberToDelete?.name}</strong>? Their independent flights stay.</p>
          {s.deleteMemberError && <p role="alert" className="text-sm font-bold text-sunset-coral">{s.deleteMemberError}</p>}
          {modalActions(() => s.setMemberToDelete(null), <GhButton onClick={s.handleConfirmDeleteMember} icon={<Trash2 className="w-4 h-4" />}>Remove</GhButton>)}
        </div>
      </Modal>

      {s.isFlightWizardOpen && (
        <React.Suspense fallback={null}>
          <FlightImportWizard isOpen={s.isFlightWizardOpen} onClose={() => s.setIsFlightWizardOpen(false)} onImportComplete={s.refreshData} users={s.users} />
        </React.Suspense>
      )}
    </>
  );

  if (!current) {
    return (
      <GhPage title="Your settings" icon={<Gear className="w-8 h-8" />} action={saveButton}>
        <div className="rounded-3xl overflow-hidden relative h-40 sm:h-52">
          <SunsetScene />
          <div className="absolute left-5 bottom-4 sm:left-8 sm:bottom-6 rounded-2xl bg-white/90 dark:bg-sunset-plum px-4 py-2 shadow-card">
            <div className="text-xs font-bold uppercase tracking-wider text-sunset-ink/70 dark:text-white/70">Workspace</div>
            <div className="text-lg sm:text-2xl font-black text-sunset-ink dark:text-white">{config.orgName || 'WanderGrid'}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiles.map(t => (
            <GhCard key={t.id} tone={t.tone} onClick={() => setSection(t.id)} label={`Open ${t.title}`} className="!p-5 min-h-[140px] flex flex-col justify-between">
              <div className="flex items-start justify-between w-full">
                <span className="w-14 h-14 rounded-2xl bg-white/30 flex items-center justify-center">{t.icon}</span>
                {t.badge && <span className="rounded-full bg-white/30 px-3 py-1 text-sm font-black">{t.badge}</span>}
              </div>
              <div className="flex items-end justify-between w-full mt-4">
                <div><div className="text-2xl font-black tracking-tight">{t.title}</div><div className="text-sm font-medium opacity-80">{t.hint}</div></div>
                <CaretRight className="w-6 h-6 shrink-0" />
              </div>
            </GhCard>
          ))}
        </div>
        {modals}
      </GhPage>
    );
  }

  return (
    <GhPage
      title={current.title}
      icon={<button type="button" onClick={() => setSection(null)} aria-label="Back to settings" className="w-11 h-11 rounded-full bg-white dark:bg-sunset-plum text-sunset-ink dark:text-white shadow-card flex items-center justify-center cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>}
      action={saveButton}
    >
      {section === 'workspace' && renderWorkspace()}
      {section === 'personnel' && renderPersonnel()}
      {section === 'integrations' && renderIntegrations()}
      {section === 'gear' && <GearSettingsTab config={config} setConfig={setConfig} handleSaveOrgSettings={s.handleSaveOrgSettings} isSavingOrg={s.isSavingOrg} />}
      {section === 'carriers' && <CarriersTab config={config} setConfig={setConfig} handleSaveOrgSettings={s.handleSaveOrgSettings} isSavingOrg={s.isSavingOrg} />}
      {section === 'data' && renderData()}
      {modals}
    </GhPage>
  );
};

const FlightImportWizard = React.lazy(() => import('../../components/FlightImportWizard').then(m => ({ default: m.FlightImportWizard })));
