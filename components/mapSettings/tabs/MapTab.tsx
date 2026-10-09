import React, { useMemo } from 'react';
import {
  Globe,
  MapTrifold,
  Sun,
  Compass,
  Moon,
  Mountains,
  Planet,
  Sparkle,
  Buildings,
  Waves,
  Check,
} from '@phosphor-icons/react';
import { MapAppearanceSettings, BasemapMode, getEffectiveBasemap } from '../../../types/mapAppearance';
import MAP_SETTINGS_LABELS from '../labels';
import { GlassSegmented } from '../../glass/GlassSegmented';
import { GlassToggle } from '../../glass/GlassToggle';
import { SettingRow } from '../../glass/SettingRow';
import { SettingsSection } from '../../glass/SettingsSection';

interface MapTabProps {
  settings: MapAppearanceSettings;
  onChangeSetting: <K extends keyof MapAppearanceSettings>(field: K, value: MapAppearanceSettings[K]) => void;
  isDark: boolean;
}

interface BasemapDef {
  id: BasemapMode;
  label: string;
  icon: React.ComponentType<{ className?: string; weight?: any; size?: number }>;
  gradientClass: string;
  textColor: string;
  badge?: string;
  isDarkOnly?: boolean;
}

const BASEMAP_GROUPS: { groupName: string; items: BasemapDef[] }[] = [
  {
    groupName: MAP_SETTINGS_LABELS.mapTab.basemapGroups.auto,
    items: [
      {
        id: 'default',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.default,
        icon: Sparkle,
        gradientClass: 'bg-gradient-to-r from-primary-500/20 via-sky-500/20 to-indigo-500/20 border-primary-500/30',
        textColor: 'text-primary-700 dark:text-primary-300',
      },
    ],
  },
  {
    groupName: MAP_SETTINGS_LABELS.mapTab.basemapGroups.streets,
    items: [
      {
        id: 'liberty',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.liberty,
        icon: MapTrifold,
        gradientClass: 'bg-gradient-to-r from-emerald-100 via-sky-100 to-amber-100 dark:from-emerald-950/60 dark:via-sky-950/60 dark:to-amber-950/60 border-emerald-500/30',
        textColor: 'text-emerald-800 dark:text-emerald-200',
      },
      {
        id: 'bright',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.bright,
        icon: Sun,
        gradientClass: 'bg-gradient-to-r from-amber-100 via-yellow-100 to-orange-100 dark:from-amber-950/60 dark:via-yellow-950/60 dark:to-orange-950/60 border-amber-500/30',
        textColor: 'text-amber-800 dark:text-amber-200',
      },
      {
        id: 'positron',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.positron,
        icon: Compass,
        gradientClass: 'bg-gradient-to-r from-zinc-100 via-slate-100 to-white dark:from-zinc-900/80 dark:via-slate-900/80 dark:to-zinc-800/80 border-slate-400/30',
        textColor: 'text-slate-700 dark:text-slate-300',
      },
    ],
  },
  {
    groupName: MAP_SETTINGS_LABELS.mapTab.basemapGroups.dark,
    items: [
      {
        id: 'dark',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.dark,
        icon: Moon,
        gradientClass: 'bg-gradient-to-r from-zinc-900 via-neutral-900 to-zinc-800 border-zinc-700/50',
        textColor: 'text-zinc-200',
      },
      {
        id: 'fiord',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.fiord,
        icon: Mountains,
        gradientClass: 'bg-gradient-to-r from-[#111c2e] via-[#1a2b42] to-[#162235] border-blue-400/30',
        textColor: 'text-blue-200',
      },
    ],
  },
  {
    groupName: MAP_SETTINGS_LABELS.mapTab.basemapGroups.imagery,
    items: [
      {
        id: 'satellite',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.satellite,
        icon: Planet,
        gradientClass: 'bg-gradient-to-r from-[#0a1a14] via-[#0d2a1f] to-[#12382b] border-emerald-500/30',
        textColor: 'text-emerald-200',
      },
      {
        id: 'citylights',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.citylights,
        icon: Sparkle,
        gradientClass: 'bg-gradient-to-r from-[#040711] via-[#0a0f24] to-[#131b3d] border-amber-500/30',
        textColor: 'text-amber-200',
      },
    ],
  },
  {
    groupName: MAP_SETTINGS_LABELS.mapTab.basemapGroups.special,
    items: [
      {
        id: '3d',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.threeD,
        icon: Buildings,
        gradientClass: 'bg-gradient-to-r from-indigo-100 via-sky-100 to-purple-100 dark:from-indigo-950/60 dark:via-sky-950/60 dark:to-purple-950/60 border-purple-500/30',
        textColor: 'text-purple-800 dark:text-purple-200',
      },
      {
        id: 'ocean',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.ocean,
        icon: Waves,
        gradientClass: 'bg-gradient-to-r from-[#041a2f] via-[#062c4f] to-[#0a3e6d] border-cyan-500/30',
        textColor: 'text-cyan-200',
        isDarkOnly: true,
      },
    ],
  },
];

interface BasemapCardProps {
  item: BasemapDef;
  isSelected: boolean;
  isDark: boolean;
  onSelect: (id: BasemapMode) => void;
}

const BasemapCard = React.memo<BasemapCardProps>(({
  item,
  isSelected,
  isDark,
  onSelect,
}) => {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={`p-2 rounded-xl border transition-all duration-150 text-left flex flex-col justify-between gap-1.5 cursor-pointer active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${
        isSelected
          ? 'border-primary-500/50 bg-primary-500/15 dark:bg-primary-500/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_8px_rgba(234,88,12,0.15)] ring-1 ring-primary-500/30 wg-glass-surface'
          : 'border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] hover:border-black/15 dark:hover:border-white/20'
      }`}
    >
      {/* Swatch Pill with Phosphor Icon */}
      <div
        className={`w-full h-7 rounded-lg border flex items-center px-2 justify-between relative overflow-hidden ${item.gradientClass}`}
      >
        <div className="flex items-center gap-1.5 z-10">
          <Icon className={`w-3.5 h-3.5 ${item.textColor}`} weight="bold" />
          <span className={`text-2xs font-bold truncate ${item.textColor}`}>
            {item.label}
          </span>
        </div>
        {isSelected && (
          <div className="w-3.5 h-3.5 rounded-full bg-primary-500 flex items-center justify-center text-white shrink-0 z-10 shadow-xs">
            <Check className="w-2.5 h-2.5" weight="bold" />
          </div>
        )}
      </div>

      {/* Caption & dark-theme-only helper */}
      <div className="flex items-center justify-between gap-1 w-full px-0.5">
        <span className="text-2xs sm:text-xs font-bold text-light-text dark:text-dark-text truncate">
          {item.label}
        </span>
        {item.isDarkOnly && !isDark && (
          <span className="text-3xs font-medium text-light-text-secondary dark:text-dark-text-secondary shrink-0">
            {MAP_SETTINGS_LABELS.mapTab.oceanDarkOnlyHelper}
          </span>
        )}
      </div>
    </button>
  );
});

export const MapTab: React.FC<MapTabProps> = ({
  settings,
  onChangeSetting,
  isDark,
}) => {
  const isGlobe = settings.projection === 'globe';

  const effectiveBasemap = useMemo(() => {
    return getEffectiveBasemap(settings.basemap, isDark);
  }, [settings.basemap, isDark]);

  return (
    <div className="space-y-3 animate-fadeIn">
      {/* 1. VIEW PROJECTION ENGINE */}
      <SettingsSection title={MAP_SETTINGS_LABELS.mapTab.view} accentColor="sky">
        <GlassSegmented<'globe' | 'flat'>
          options={[
            { id: 'globe', label: MAP_SETTINGS_LABELS.mapTab.globe, icon: Globe, accentColor: 'sky' },
            { id: 'flat', label: MAP_SETTINGS_LABELS.mapTab.flat, icon: MapTrifold, accentColor: 'emerald' },
          ]}
          value={settings.projection || 'flat'}
          onChange={(val) => onChangeSetting('projection', val)}
          columns={2}
          showCheckOnSelected
        />

        {/* Stars & atmosphere: disabled with helper in Flat view */}
        <SettingRow
          label={MAP_SETTINGS_LABELS.mapTab.starsAndAtmosphere}
          helper={!isGlobe ? MAP_SETTINGS_LABELS.mapTab.starsAtmosphereHelper : undefined}
          icon={
            <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
              <Sparkle size={15} weight="bold" />
            </div>
          }
          control={
            <GlassToggle
              checked={isGlobe && settings.atmosphere !== false}
              disabled={!isGlobe}
              accentColor="sky"
              onChange={(val) => onChangeSetting('atmosphere', val)}
              ariaLabel={MAP_SETTINGS_LABELS.mapTab.starsAndAtmosphere}
            />
          }
        />

        {/* Day & night shading */}
        <SettingRow
          label={MAP_SETTINGS_LABELS.mapTab.dayNightShading}
          icon={
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <Sun size={15} weight="bold" />
            </div>
          }
          control={
            <GlassToggle
              checked={Boolean(settings.timeOfDay)}
              accentColor="amber"
              onChange={(val) => onChangeSetting('timeOfDay', val)}
              ariaLabel={MAP_SETTINGS_LABELS.mapTab.dayNightShading}
            />
          }
        />
      </SettingsSection>

      {/* 2. BASEMAP PICKER */}
      <SettingsSection title={MAP_SETTINGS_LABELS.mapTab.basemap} accentColor="primary">
        <div className="space-y-2.5">
          {BASEMAP_GROUPS.map((group) => (
            <div key={group.groupName} className="space-y-1.5">
              <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
                {group.groupName}
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {group.items.map((b) => {
                  const isSelected =
                    settings.basemap === b.id ||
                    (settings.basemap === 'default' && b.id === 'default') ||
                    (b.id !== 'default' && effectiveBasemap === b.id);

                  return (
                    <BasemapCard
                      key={b.id}
                      item={b}
                      isSelected={isSelected}
                      isDark={isDark}
                      onSelect={(id) => onChangeSetting('basemap', id)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SettingsSection>
    </div>
  );
};

export default MapTab;
