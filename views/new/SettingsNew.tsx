import React, { useMemo, useState } from 'react';
import { useSettingsData } from '../../hooks/useSettingsData';
import SwipeTabs from '../../components/kokonutui/swipe-tabs';
import { RpEmpty, useIsMobile } from '../../components/new/ui';
import { WorkspacePane } from '../../components/new/settings/WorkspacePane';
import { MembersPane } from '../../components/new/settings/MembersPane';
import { IntegrationsPane } from '../../components/new/settings/IntegrationsPane';
import { GearPane } from '../../components/new/settings/GearPane';
import { CarriersPane } from '../../components/new/settings/CarriersPane';
import { DataPane } from '../../components/new/settings/DataPane';
import { card, StatTile } from '../../components/new/settings/SettingsParts';
import { Airplane, Backpack, Database, Gear, Plugs, Users, type Icon } from '../../components/ui/hugeicons';
import { cn } from '../../utils/cn';

/**
 * SettingsNew (UI_UX_DESIGN_REFERENCE.md §5.0): the redesigned settings, at /settings-new. Features come
 * from the data layer (workspace settings, members, backups, jobs, integrations); the layout is new:
 * three tiles, then a section list on wide screens that becomes Swipe Tabs below 1024px. Every section is
 * a Stack Panel of settings rows, with sheets for anything that needs a field. Admins change workspace-wide
 * things; everyone else gets their own preferences and a read-only view.
 */

type SectionId = 'workspace' | 'members' | 'integrations' | 'gear' | 'carriers' | 'data';
const TAB_KEY = 'wandergrid_settings_new_tab';

const SECTIONS: Array<{ id: SectionId; title: string; icon: Icon; admin?: boolean; pill: { bg: string; text: string; icon: string } }> = [
    { id: 'workspace', title: 'Workspace', icon: Gear, pill: { bg: 'bg-rp-ink', text: 'text-rp-on-ink', icon: 'text-rp-muted' } },
    { id: 'members', title: 'Members', icon: Users, pill: { bg: 'bg-rp-green', text: 'text-rp-paper', icon: 'text-rp-green' } },
    { id: 'integrations', title: 'Integrations', icon: Plugs, admin: true, pill: { bg: 'bg-rp-rust', text: 'text-rp-paper', icon: 'text-rp-rust' } },
    { id: 'gear', title: 'Gear', icon: Backpack, admin: true, pill: { bg: 'bg-rp-mustard', text: 'text-rp-on-mustard', icon: 'text-rp-ochre' } },
    { id: 'carriers', title: 'Carriers', icon: Airplane, admin: true, pill: { bg: 'bg-rp-navy', text: 'text-rp-paper dark:text-rp-on-ink', icon: 'text-rp-navy' } },
    { id: 'data', title: 'Data', icon: Database, admin: true, pill: { bg: 'bg-rp-ink', text: 'text-rp-on-ink', icon: 'text-rp-muted' } },
];

const readTab = (): SectionId => {
    try {
        const v = localStorage.getItem(TAB_KEY);
        return SECTIONS.some(s => s.id === v) ? (v as SectionId) : 'workspace';
    } catch { return 'workspace'; }
};

interface SettingsNewProps {
    theme: 'light' | 'dark' | 'auto';
    isDark: boolean;
    onThemeChange: (theme: 'light' | 'dark' | 'auto') => void;
    /** Opens a member's New page. */
    onOpenMember: (id: string) => void;
    /** Opens another New page (Flights, for importing). */
    onNavigate: (path: string) => void;
}

export const SettingsNew: React.FC<SettingsNewProps> = ({ theme, isDark, onThemeChange, onOpenMember, onNavigate }) => {
    const data = useSettingsData();
    const mobile = useIsMobile();
    const [tab, setTab] = useState<SectionId>(readTab);

    const sections = useMemo(() => SECTIONS.filter(s => !s.admin || data.isAdmin), [data.isAdmin]);
    const active: SectionId = sections.some(s => s.id === tab) ? tab : 'workspace';
    const choose = (id: SectionId) => {
        setTab(id);
        try { localStorage.setItem(TAB_KEY, id); } catch { /* storage unavailable */ }
    };

    if (data.loading) {
        return (
            <div className="px-3 pt-2 sm:px-6" aria-busy="true">
                <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
                    <div className="h-12 w-48 animate-pulse rounded-full bg-rp-surface/70" />
                    <div className="h-20 animate-pulse rounded-rp-card bg-rp-surface/70" />
                    <div className="h-80 animate-pulse rounded-rp-card bg-rp-surface/70" />
                </div>
            </div>
        );
    }
    if (!data.settings) {
        return (
            <div className="px-3 pt-2 sm:px-6">
                <div className={cn('mx-auto w-full max-w-[1180px]', card)}>
                    <RpEmpty title="Couldn't load the settings" action={<button type="button" onClick={() => void data.reload()} className="inline-flex min-h-11 items-center rounded-full bg-rp-ink px-5 text-sm font-medium text-rp-on-ink">Try again</button>}>
                        {data.error ?? 'Check your connection and try again.'}
                    </RpEmpty>
                </div>
            </div>
        );
    }

    const { settings, users } = data;
    const keyFields = ['googleGeminiApiKey', 'aviationStackApiKey', 'aeroDataBoxApiKey', 'openAipApiKey'] as const;
    const keysSet = keyFields.filter(k => settings.configuredKeys?.[k]).length + (settings.brandfetchApiKey ? 1 : 0) + (settings.cartoApiKey ? 1 : 0);
    const fromHost = keyFields.filter(k => settings.keySources?.[k] === 'env').length;
    const gearCount = settings.masterPackingList?.length ?? 0;
    const carrierCount = settings.carriers?.length ?? 0;
    const admins = users.filter(u => u.role === 'Admin').length;

    const tabItems = sections.map(s => ({
        id: s.id,
        title: s.title,
        icon: s.icon,
        hideTitle: mobile && s.id !== active,
        iconClassName: active === s.id ? undefined : s.pill.icon,
    }));
    const activePill = SECTIONS.find(s => s.id === active)!.pill;

    return (
        <div className="custom-scrollbar h-full overflow-y-auto px-3 pt-2 pb-32 sm:px-6 md:pb-16">
            <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 lg:gap-6">
                <h1 className="text-[1.75rem] leading-[1.1] font-medium tracking-tight sm:text-[2.25rem]">Settings</h1>

                <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                    <StatTile tone="ink" icon={Users} value={users.length} unit={users.length === 1 ? 'member' : 'members'} sub={`${admins} ${admins === 1 ? 'admin' : 'admins'}`} />
                    <StatTile tone="green" icon={Plugs} value={keysSet} unit={keysSet === 1 ? 'key' : 'keys'} sub={fromHost > 0 ? `${fromHost} from the host` : 'of 6 services'} />
                    <StatTile tone="mustard" icon={Backpack} value={gearCount} unit="gear" sub={`${carrierCount} ${carrierCount === 1 ? 'carrier' : 'carriers'}`} />
                </div>

                <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-6">
                    <div className="lg:hidden">
                        <div className="-m-3 overflow-x-auto p-3 [scrollbar-width:none]">
                            <SwipeTabs
                                items={tabItems}
                                value={active}
                                onChange={id => choose(id as SectionId)}
                                panels={false}
                                label="Settings sections"
                                className="w-full sm:w-auto"
                                listClassName="bg-rp-surface rp-shadow-soft"
                                activeColor={activePill.bg}
                                activeTextColor={activePill.text}
                            />
                        </div>
                    </div>

                    <nav aria-label="Settings sections" className={cn(card, 'sticky top-2 hidden flex-col gap-1 p-2 lg:flex')}>
                        {sections.map(s => {
                            const on = s.id === active;
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    aria-current={on ? 'page' : undefined}
                                    onClick={() => choose(s.id)}
                                    className={cn(
                                        'flex min-h-11 items-center gap-3 rounded-full px-4 text-left text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted',
                                        on ? `${s.pill.bg} ${s.pill.text}` : 'text-rp-ink hover:bg-rp-inset'
                                    )}
                                >
                                    <s.icon size={18} className={on ? undefined : s.pill.icon} aria-hidden />
                                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                                </button>
                            );
                        })}
                    </nav>

                    <div className="mt-4 min-w-0 lg:mt-0">
                        {active === 'workspace' ? <WorkspacePane data={data} theme={theme} isDark={isDark} onThemeChange={onThemeChange} /> : null}
                        {active === 'members' ? <MembersPane data={data} onOpenMember={onOpenMember} /> : null}
                        {active === 'integrations' && data.isAdmin ? <IntegrationsPane data={data} /> : null}
                        {active === 'gear' && data.isAdmin ? <GearPane data={data} /> : null}
                        {active === 'carriers' && data.isAdmin ? <CarriersPane data={data} /> : null}
                        {active === 'data' && data.isAdmin ? <DataPane data={data} onNavigate={onNavigate} /> : null}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsNew;
