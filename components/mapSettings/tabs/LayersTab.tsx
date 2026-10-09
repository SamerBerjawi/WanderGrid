import React from 'react';
import { CaretLeft, CaretRight, WarningCircle } from '@phosphor-icons/react';
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
    <div className="space-y-5 animate-fadeIn">
      {/* 1. PRECIPITATION & WEATHER */}
      <SettingsSection>
        {/* Rain Radar */}
        <SettingRow
          label={MAP_SETTINGS_LABELS.layersTab.rainRadar}
          control={
            <GlassToggle
              checked={Boolean(settings.rainRadar)}
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
              onChange={(val) => onChangeSetting('rainRadarOpacity', val)}
              onPointerUp={onFlushSettings}
            />
          )}
        </SettingRow>
      </SettingsSection>

      {/* 2. TERRAIN & ELEVATION */}
      <SettingsSection>
        {/* Relief Shading (Hillshade) */}
        <SettingRow
          label={MAP_SETTINGS_LABELS.layersTab.reliefShading}
          control={
            <GlassToggle
              checked={Boolean(settings.terrainHillshade)}
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
              onChange={(val) => onChangeSetting('terrainHillshadeOpacity', val)}
              onPointerUp={onFlushSettings}
            />
          )}
        </SettingRow>

        {/* 3D Elevation Mesh (only if GEV_P04D_TERRAIN enabled) */}
        {FEATURE_FLAGS.GEV_P04D_TERRAIN && (
          <div className="pt-2 border-t border-black/5 dark:border-white/5">
            <SettingRow
              label={MAP_SETTINGS_LABELS.layersTab.terrain3d}
              control={
                <GlassToggle
                  checked={Boolean(settings.terrain3d)}
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
                  formatValue={(v) => `${v.toFixed(1)}x`}
                  onChange={(val) => onChangeSetting('terrain3dExaggeration', val)}
                  onPointerUp={onFlushSettings}
                />
              )}
            </SettingRow>
          </div>
        )}
      </SettingsSection>

      {/* 3. INFRASTRUCTURE & AVIATION */}
      <SettingsSection>
        {/* Rail lines */}
        <SettingRow
          label={MAP_SETTINGS_LABELS.layersTab.railLines}
          control={
            <GlassToggle
              checked={Boolean(settings.transitOverlay)}
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
              onChange={(val) => onChangeSetting('transitOverlayOpacity', val)}
              onPointerUp={onFlushSettings}
            />
          )}
        </SettingRow>

        {/* Aviation charts (OpenAIP) */}
        <div className="pt-2 border-t border-black/5 dark:border-white/5">
          <SettingRow
            label={MAP_SETTINGS_LABELS.layersTab.aviationCharts}
            helper={!hasOpenAipKey ? MAP_SETTINGS_LABELS.layersTab.openAipKeyRequired : undefined}
            control={
              <GlassToggle
                checked={hasOpenAipKey && Boolean(settings.openAipOverlay)}
                disabled={!hasOpenAipKey}
                onChange={(val) => onChangeSetting('openAipOverlay', val)}
                ariaLabel={MAP_SETTINGS_LABELS.layersTab.aviationCharts}
              />
            }
          >
            {/* Show chips only when key present and overlay enabled */}
            {hasOpenAipKey && settings.openAipOverlay && (
              <div className="space-y-2">
                <GlassSegmented<'airspaces' | 'airports'>
                  options={[
                    { id: 'airspaces', label: MAP_SETTINGS_LABELS.layersTab.airspaces },
                    { id: 'airports', label: MAP_SETTINGS_LABELS.layersTab.airports },
                  ]}
                  value={
                    (settings.openAipGroups || []).filter(
                      (g) => g === 'airspaces' || g === 'airports'
                    ) as ('airspaces' | 'airports')[]
                  }
                  onChange={(selected: ('airspaces' | 'airports')[]) => {
                    // Retain airspaceLabels if airspaces is selected
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
                  showCheckOnSelected
                />
              </div>
            )}
          </SettingRow>
        </div>
      </SettingsSection>

      {/* 4. DAILY SATELLITE (only if GEV_P04C_GIBS_DAILY is on) */}
      {FEATURE_FLAGS.GEV_P04C_GIBS_DAILY && (
        <SettingsSection>
          <SettingRow
            label={MAP_SETTINGS_LABELS.layersTab.dailySatellite}
            control={
              <GlassToggle
                checked={Boolean(settings.gibsDaily)}
                onChange={(val) => onChangeSetting('gibsDaily', val)}
                ariaLabel={MAP_SETTINGS_LABELS.layersTab.dailySatellite}
              />
            }
          >
            {settings.gibsDaily && (
              <div className="space-y-3">
                {/* Date Stepper */}
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-bold text-light-text-secondary dark:text-dark-text-secondary">
                    {MAP_SETTINGS_LABELS.layersTab.imageryDate}
                  </span>
                  <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-xl p-1 border border-black/5 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => {
                        const cur = settings.gibsDailyDate || getYesterdayDateString();
                        onChangeSetting('gibsDailyDate', adjustDateString(cur, -1));
                      }}
                      className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-light-text dark:text-dark-text transition-colors cursor-pointer"
                      aria-label="Previous day imagery"
                    >
                      <CaretLeft size={16} weight="bold" />
                    </button>
                    <span className="px-2 font-mono font-bold text-xs text-light-text dark:text-dark-text">
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
                      className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-light-text dark:text-dark-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      aria-label="Next day imagery"
                    >
                      <CaretRight size={16} weight="bold" />
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
