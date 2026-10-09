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
import { syncThemeWithBasemap } from '../../../services/themeSync';
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
  subtitle?: string;
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
        subtitle: 'Adapts to theme',
        icon: Sparkle,
        gradientClass: 'bg-gradient-to-br from-primary-500/25 via-sky-500/20 to-indigo-500/30 border-primary-500/30',
        textColor: 'text-primary-600 dark:text-primary-400',
      },
    ],
  },
  {
    groupName: MAP_SETTINGS_LABELS.mapTab.basemapGroups.streets,
    items: [
      {
        id: 'liberty',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.liberty,
        subtitle: 'Roads & transit',
        icon: MapTrifold,
        gradientClass: 'bg-gradient-to-br from-emerald-100 via-sky-100 to-amber-100 dark:from-emerald-950/70 dark:via-sky-950/70 dark:to-teal-950/70 border-emerald-500/30',
        textColor: 'text-emerald-700 dark:text-emerald-300',
      },
      {
        id: 'bright',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.bright,
        subtitle: 'Warm daylight',
        icon: Sun,
        gradientClass: 'bg-gradient-to-br from-amber-100 via-yellow-100 to-orange-100 dark:from-amber-950/70 dark:via-yellow-950/70 dark:to-orange-950/70 border-amber-500/30',
        textColor: 'text-amber-700 dark:text-amber-300',
      },
      {
        id: 'positron',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.positron,
        subtitle: 'Clean & minimal',
        icon: Compass,
        gradientClass: 'bg-gradient-to-br from-slate-100 via-zinc-100 to-white dark:from-zinc-900/90 dark:via-slate-900/90 dark:to-zinc-800/90 border-slate-400/30',
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
        subtitle: 'Midnight charcoal',
        icon: Moon,
        gradientClass: 'bg-gradient-to-br from-zinc-900 via-neutral-900 to-stone-900 border-zinc-700/50',
        textColor: 'text-zinc-200',
      },
      {
        id: 'fiord',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.fiord,
        subtitle: 'Deep navy',
        icon: Mountains,
        gradientClass: 'bg-gradient-to-br from-[#0c1a2e] via-[#162a45] to-[#1e3a5f] border-blue-400/30',
        textColor: 'text-blue-300',
      },
    ],
  },
  {
    groupName: MAP_SETTINGS_LABELS.mapTab.basemapGroups.imagery,
    items: [
      {
        id: 'satellite',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.satellite,
        subtitle: 'Earth orbit',
        icon: Planet,
        gradientClass: 'bg-gradient-to-br from-[#071911] via-[#0d2a1f] to-[#1a4435] border-emerald-500/30',
        textColor: 'text-emerald-300',
      },
      {
        id: 'citylights',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.citylights,
        subtitle: 'Night lights',
        icon: Sparkle,
        gradientClass: 'bg-gradient-to-br from-[#030612] via-[#091129] to-[#15234d] border-amber-500/30',
        textColor: 'text-amber-300',
      },
    ],
  },
  {
    groupName: MAP_SETTINGS_LABELS.mapTab.basemapGroups.special,
    items: [
      {
        id: '3d',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.threeD,
        subtitle: '3D buildings',
        icon: Buildings,
        gradientClass: 'bg-gradient-to-br from-indigo-100 via-purple-100 to-sky-100 dark:from-indigo-950/70 dark:via-purple-950/70 dark:to-sky-950/70 border-purple-500/30',
        textColor: 'text-purple-700 dark:text-purple-300',
      },
      {
        id: 'ocean',
        label: MAP_SETTINGS_LABELS.mapTab.basemaps.ocean,
        subtitle: 'Bathymetry',
        icon: Waves,
        gradientClass: 'bg-gradient-to-br from-[#031526] via-[#06294a] to-[#0d477a] border-cyan-500/30',
        textColor: 'text-cyan-300',
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
      className={`group relative p-2 rounded-2xl border transition-all duration-200 text-left flex flex-col gap-1.5 cursor-pointer active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${
        isSelected
          ? 'border-primary-500/50 bg-primary-500/10 dark:bg-primary-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_2px_10px_rgba(234,88,12,0.12)] ring-1 ring-primary-500/40'
          : 'border-black/5 dark:border-white/10 bg-white/50 dark:bg-white/[0.04] hover:bg-white/80 dark:hover:bg-white/[0.08] hover:border-black/15 dark:hover:border-white/20'
      }`}
    >
      {/* Visual Swatch Preview (clean map aesthetic, no duplicated title) */}
      <div
        className={`w-full h-11 rounded-xl border flex items-center justify-between px-2.5 relative overflow-hidden transition-transform duration-200 group-hover:scale-[1.01] ${item.gradientClass}`}
      >
        {/* Subtle grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.07] dark:opacity-[0.12] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
            backgroundSize: '8px 8px'
          }}
        />

        {/* Icon glass badge */}
        <div className="w-6 h-6 rounded-lg bg-white/70 dark:bg-white/10 backdrop-blur-sm border border-white/60 dark:border-white/10 flex items-center justify-center shrink-0 shadow-xs z-10 transition-transform group-hover:scale-105">
          <Icon className={`w-3.5 h-3.5 ${item.textColor}`} weight="bold" />
        </div>

        {/* Active Selected Check Badge */}
        {isSelected && (
          <div className="w-4 h-4 rounded-full bg-primary-500 flex items-center justify-center text-white shrink-0 z-10 shadow-xs ring-2 ring-white/60 dark:ring-dark-card animate-scaleIn">
            <Check className="w-2.5 h-2.5" weight="bold" />
          </div>
        )}
      </div>

      {/* Typography: Title + Subtitle */}
      <div className="w-full px-0.5 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-bold text-light-text dark:text-dark-text tracking-tight truncate">
            {item.label}
          </span>
        </div>
        <div className="mt-0.5 truncate">
          {item.isDarkOnly && !isDark ? (
            <span className="text-3xs font-semibold text-amber-600 dark:text-amber-400 truncate block">
              {MAP_SETTINGS_LABELS.mapTab.oceanDarkOnlyHelper}
            </span>
          ) : item.subtitle ? (
            <span className="text-3xs font-medium text-light-text-secondary dark:text-dark-text-secondary truncate block">
              {item.subtitle}
            </span>
          ) : null}
        </div>
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

  const handleSelectBasemap = (id: BasemapMode) => {
    onChangeSetting('basemap', id);
    syncThemeWithBasemap(id);
  };

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
                      onSelect={handleSelectBasemap}
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
