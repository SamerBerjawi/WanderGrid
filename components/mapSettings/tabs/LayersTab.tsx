import React from 'react';
import {
  CaretLeft,
  CaretRight,
  CloudRain,
  Mountains,
  Cube,
  Train,
  AirplaneTakeoff,
  Planet,
} from '@phosphor-icons/react';
import {
  MapAppearanceSettings,
  getYesterdayDateString,
  adjustDateString,
} from '../../../types/mapAppearance';
import { FEATURE_FLAGS } from '../../../config/featureFlags';
import MAP_SETTINGS_LABELS from '../labels';
import { GlassToggle } from '../../glass/GlassToggle';
import { GlassSlider } from '../../glass/GlassSlider';
import { GlassSegmented } from '../../glass/GlassSegmented';
import { SettingRow } from '../../glass/SettingRow';
import { SettingsSection } from '../../glass/SettingsSection';

interface LayersTabProps {
  settings: MapAppearanceSettings;
  onChangeSetting: <K extends keyof MapAppearanceSettings>(field: K, value: MapAppearanceSettings[K]) => void;
  hasOpenAipKey: boolean;
  onFlushSettings?: () => void;
}

export const LayersTab: React.FC<LayersTabProps> = ({
  settings,
  onChangeSetting,
  hasOpenAipKey,
  onFlushSettings,
}) => {
  return (
    <div className="space-y-3 animate-fadeIn">
      {/* 1. PRECIPITATION & WEATHER */}
      <SettingsSection accentColor="cyan">
        {/* Rain Radar */}
        <SettingRow
          label={MAP_SETTINGS_LABELS.layersTab.rainRadar}
          icon={
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
              <CloudRain size={15} weight="bold" />
            </div>
          }
          control={
            <GlassToggle
              checked={Boolean(settings.rainRadar)}
              accentColor="cyan"
              onChange={(val) => onChangeSetting('rainRadar', val)}
              ariaLabel={MAP_SETTINGS_LABELS.layersTab.rainRadar}
            />
          }
        >
          {settings.rainRadar && (
            <GlassSlider
              label={MAP_SETTINGS_LABELS.layersTab.opacity}
              value={settings.rainRadarOpacity ?? 0.85}
              min={0.2}
              max={1.0}
              step={0.05}
              accentColor="cyan"
              onChange={(val) => onChangeSetting('rainRadarOpacity', val)}
              onPointerUp={onFlushSettings}
            />
          )}
        </SettingRow>
      </SettingsSection>

      {/* 2. TERRAIN & ELEVATION */}
      <SettingsSection accentColor="amber">
        {/* Relief Shading (Hillshade) */}
        <SettingRow
          label={MAP_SETTINGS_LABELS.layersTab.reliefShading}
          icon={
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <Mountains size={15} weight="bold" />
            </div>
          }
          control={
            <GlassToggle
              checked={Boolean(settings.terrainHillshade)}
              accentColor="amber"
              onChange={(val) => onChangeSetting('terrainHillshade', val)}
              ariaLabel={MAP_SETTINGS_LABELS.layersTab.reliefShading}
            />
          }
        >
          {settings.terrainHillshade && (
            <GlassSlider
              label={MAP_SETTINGS_LABELS.layersTab.strength}
              value={settings.terrainHillshadeOpacity ?? 0.8}
              min={0.1}
              max={1.0}
              step={0.05}
              accentColor="amber"
              onChange={(val) => onChangeSetting('terrainHillshadeOpacity', val)}
              onPointerUp={onFlushSettings}
            />
          )}
        </SettingRow>

        {/* 3D Elevation Mesh (only if GEV_P04D_TERRAIN enabled) */}
        {FEATURE_FLAGS.GEV_P04D_TERRAIN && (
          <div className="pt-1.5 border-t border-black/5 dark:border-white/5">
            <SettingRow
              label={MAP_SETTINGS_LABELS.layersTab.terrain3d}
              icon={
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Cube size={15} weight="bold" />
                </div>
              }
              control={
                <GlassToggle
                  checked={Boolean(settings.terrain3d)}
                  accentColor="emerald"
                  onChange={(val) => onChangeSetting('terrain3d', val)}
                  ariaLabel={MAP_SETTINGS_LABELS.layersTab.terrain3d}
                />
              }
            >
              {settings.terrain3d && (
                <GlassSlider
                  label={MAP_SETTINGS_LABELS.layersTab.heightExaggeration}
                  value={settings.terrain3dExaggeration ?? 1.0}
                  min={0.5}
                  max={2.5}
                  step={0.1}
                  accentColor="emerald"
                  formatValue={(v) => `${v.toFixed(1)}x`}
                  onChange={(val) => onChangeSetting('terrain3dExaggeration', val)}
                  onPointerUp={onFlushSettings}
                />
              )}
            </SettingRow>
          </div>
        )}
      </SettingsSection>

      {/* 3. RAIL */}
      <SettingsSection accentColor="indigo">
        {/* Rail lines */}
        <SettingRow
          label={MAP_SETTINGS_LABELS.layersTab.railLines}
          icon={
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Train size={15} weight="bold" />
            </div>
          }
          control={
            <GlassToggle
              checked={Boolean(settings.transitOverlay)}
              accentColor="indigo"
              onChange={(val) => onChangeSetting('transitOverlay', val)}
              ariaLabel={MAP_SETTINGS_LABELS.layersTab.railLines}
            />
          }
        >
          {settings.transitOverlay && (
            <GlassSlider
              label={MAP_SETTINGS_LABELS.layersTab.opacity}
              value={settings.transitOverlayOpacity ?? 0.4}
              min={0.1}
              max={1.0}
              step={0.05}
              accentColor="indigo"
              onChange={(val) => onChangeSetting('transitOverlayOpacity', val)}
              onPointerUp={onFlushSettings}
            />
          )}
        </SettingRow>
      </SettingsSection>

      {/* 4. AVIATION (OpenAIP) */}
      <SettingsSection accentColor="sky">
        {/* Aviation charts (OpenAIP) */}
        <div>
          <SettingRow
            label={MAP_SETTINGS_LABELS.layersTab.aviationCharts}
            helper={!hasOpenAipKey && (settings.openAipGroups || []).includes('airspaces') ? MAP_SETTINGS_LABELS.layersTab.openAipKeyRequired : undefined}
            icon={
              <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                <AirplaneTakeoff size={15} weight="bold" />
              </div>
            }
            control={
              <GlassToggle
                checked={Boolean(settings.openAipOverlay)}
                accentColor="sky"
                onChange={(val) => onChangeSetting('openAipOverlay', val)}
                ariaLabel={MAP_SETTINGS_LABELS.layersTab.aviationCharts}
              />
            }
          >
            {/* Show chips & opacity slider when overlay enabled */}
            {settings.openAipOverlay && (
              <div className="space-y-2.5 pt-0.5">
                <GlassSegmented<'airspaces' | 'airports'>
                  options={[
                    { id: 'airspaces', label: MAP_SETTINGS_LABELS.layersTab.airspaces, accentColor: 'sky' },
                    { id: 'airports', label: MAP_SETTINGS_LABELS.layersTab.airports, accentColor: 'sky' },
                  ]}
                  value={
                    (settings.openAipGroups || []).filter(
                      (g) => g === 'airspaces' || g === 'airports'
                    ) as ('airspaces' | 'airports')[]
                  }
                  onChange={(selected: ('airspaces' | 'airports')[]) => {
                    const next: ('airspaces' | 'airspaceLabels' | 'airports')[] = [];
                    if (selected.includes('airspaces')) {
                      next.push('airspaces', 'airspaceLabels');
                    }
                    if (selected.includes('airports')) {
                      next.push('airports');
                    }
                    onChangeSetting('openAipGroups', next);
                  }}
                  isMulti
                  columns={2}
                  accentColor="sky"
                  showCheckOnSelected
                />

                <GlassSlider
                  label={MAP_SETTINGS_LABELS.layersTab.opacity}
                  value={settings.openAipOpacity ?? 0.85}
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  accentColor="sky"
                  onChange={(val) => onChangeSetting('openAipOpacity', val)}
                  onPointerUp={onFlushSettings}
                />
              </div>
            )}
          </SettingRow>
        </div>
      </SettingsSection>

      {/* 4. DAILY SATELLITE (only if GEV_P04C_GIBS_DAILY is on) */}
      {FEATURE_FLAGS.GEV_P04C_GIBS_DAILY && (
        <SettingsSection accentColor="emerald">
          <SettingRow
            label={MAP_SETTINGS_LABELS.layersTab.dailySatellite}
            icon={
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <Planet size={15} weight="bold" />
              </div>
            }
            control={
              <GlassToggle
                checked={Boolean(settings.gibsDaily)}
                accentColor="emerald"
                onChange={(val) => onChangeSetting('gibsDaily', val)}
                ariaLabel={MAP_SETTINGS_LABELS.layersTab.dailySatellite}
              />
            }
          >
            {settings.gibsDaily && (
              <div className="space-y-2">
                {/* Date Stepper */}
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary">
                    {MAP_SETTINGS_LABELS.layersTab.imageryDate}
                  </span>
                  <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-xl p-0.5 border border-black/5 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => {
                        const cur = settings.gibsDailyDate || getYesterdayDateString();
                        onChangeSetting('gibsDailyDate', adjustDateString(cur, -1));
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-light-text dark:text-dark-text transition-colors cursor-pointer"
                      aria-label="Previous day imagery"
                    >
                      <CaretLeft size={14} weight="bold" />
                    </button>
                    <span className="px-1.5 font-mono font-bold text-2xs sm:text-xs text-light-text dark:text-dark-text">
                      {settings.gibsDailyDate || getYesterdayDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const cur = settings.gibsDailyDate || getYesterdayDateString();
                        const yesterday = getYesterdayDateString();
                        if (cur < yesterday) {
                          onChangeSetting('gibsDailyDate', adjustDateString(cur, 1));
                        }
                      }}
                      disabled={(settings.gibsDailyDate || getYesterdayDateString()) >= getYesterdayDateString()}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-light-text dark:text-dark-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      aria-label="Next day imagery"
                    >
                      <CaretRight size={14} weight="bold" />
                    </button>
                  </div>
                </div>

                {/* Opacity Slider */}
                <GlassSlider
                  label={MAP_SETTINGS_LABELS.layersTab.opacity}
                  value={settings.gibsDailyOpacity ?? 0.9}
                  min={0.2}
                  max={1.0}
                  step={0.05}
                  accentColor="emerald"
                  onChange={(val) => onChangeSetting('gibsDailyOpacity', val)}
                  onPointerUp={onFlushSettings}
                />
              </div>
            )}
          </SettingRow>
        </SettingsSection>
      )}
    </div>
  );
};

export default LayersTab;
