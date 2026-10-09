import React from 'react';
import {
  Globe,
  Airplane,
  Compass,
  MapTrifold,
  House,
  AirplaneLanding,
  Star,
} from '@phosphor-icons/react';
import { MapAppearanceSettings } from '../../../types/mapAppearance';
import MAP_SETTINGS_LABELS from '../labels';
import { GlassSegmented } from '../../glass/GlassSegmented';
import { GlassToggle } from '../../glass/GlassToggle';
import { SettingRow } from '../../glass/SettingRow';
import { SettingsSection } from '../../glass/SettingsSection';

interface TripsTabProps {
  settings: MapAppearanceSettings;
  onChangeSetting: <K extends keyof MapAppearanceSettings>(field: K, value: MapAppearanceSettings[K]) => void;
  viewMode?: 'flights' | 'land_sea' | 'scratch' | 'all';
  onSelectViewMode?: (mode: 'flights' | 'land_sea' | 'scratch' | 'all') => void;
  showIndependentFlights?: boolean;
  onToggleIndependentFlights?: () => void;
  showLandSeaRoutes?: boolean;
  onToggleLandSeaRoutes?: () => void;
  animateRoutes?: boolean;
  onToggleAnimateRoutes?: () => void;
  clusterMode?: boolean;
  onToggleClusterMode?: () => void;
  showRoadTracing?: boolean;
  onToggleRoadTracing?: () => void;
}

export const TripsTab: React.FC<TripsTabProps> = ({
  settings,
  onChangeSetting,
  viewMode,
  onSelectViewMode,
  showIndependentFlights,
  onToggleIndependentFlights,
  showLandSeaRoutes,
  onToggleLandSeaRoutes,
  animateRoutes,
  onToggleAnimateRoutes,
  clusterMode,
  onToggleClusterMode,
  showRoadTracing,
  onToggleRoadTracing,
}) => {
  const isScratchMode = viewMode === 'scratch';

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* 1. VIEW PRESET (only when parent passes onSelectViewMode) */}
      {onSelectViewMode && (
        <SettingsSection title={MAP_SETTINGS_LABELS.tripsTab.show}>
          <GlassSegmented<'all' | 'flights' | 'land_sea' | 'scratch'>
            options={[
              { id: 'all', label: MAP_SETTINGS_LABELS.tripsTab.showAll, icon: Globe },
              { id: 'flights', label: MAP_SETTINGS_LABELS.tripsTab.showFlights, icon: Airplane },
              { id: 'land_sea', label: MAP_SETTINGS_LABELS.tripsTab.showLandSea, icon: Compass },
              { id: 'scratch', label: MAP_SETTINGS_LABELS.tripsTab.showScratch, icon: MapTrifold },
            ]}
            value={viewMode || 'all'}
            onChange={(mode) => onSelectViewMode(mode)}
            columns={2}
            showCheckOnSelected
          />

          {/* Sub-toggles for Flight & Land/Sea routes (hidden in scratch view) */}
          {!isScratchMode && (
            <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-2">
              {onToggleIndependentFlights && (
                <SettingRow
                  label={MAP_SETTINGS_LABELS.tripsTab.flightRoutes}
                  control={
                    <GlassToggle
                      checked={Boolean(showIndependentFlights)}
                      onChange={onToggleIndependentFlights}
                      ariaLabel={MAP_SETTINGS_LABELS.tripsTab.flightRoutes}
                    />
                  }
                />
              )}

              {onToggleLandSeaRoutes && (
                <SettingRow
                  label={MAP_SETTINGS_LABELS.tripsTab.landSeaRoutes}
                  control={
                    <GlassToggle
                      checked={Boolean(showLandSeaRoutes)}
                      onChange={onToggleLandSeaRoutes}
                      ariaLabel={MAP_SETTINGS_LABELS.tripsTab.landSeaRoutes}
                    />
                  }
                />
              )}
            </div>
          )}
        </SettingsSection>
      )}

      {/* 2. SCRATCH MAP CONTROLS (only rendered when viewMode === 'scratch') */}
      {isScratchMode && (
        <SettingsSection title={MAP_SETTINGS_LABELS.tripsTab.scratchSection}>
          {/* Scratch City Pins */}
          <div className="space-y-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
              {MAP_SETTINGS_LABELS.tripsTab.cityPins}
            </span>
            <GlassSegmented<'off' | 'small' | 'medium' | 'large'>
              options={[
                { id: 'off', label: MAP_SETTINGS_LABELS.tripsTab.sizeOff },
                { id: 'small', label: MAP_SETTINGS_LABELS.tripsTab.sizeSmall },
                { id: 'medium', label: MAP_SETTINGS_LABELS.tripsTab.sizeMedium },
                { id: 'large', label: MAP_SETTINGS_LABELS.tripsTab.sizeLarge },
              ]}
              value={settings.scratchCitySize || 'medium'}
              onChange={(val) => onChangeSetting('scratchCitySize', val)}
              columns={4}
            />
          </div>

          {/* Highlight Countries */}
          <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
              {MAP_SETTINGS_LABELS.tripsTab.highlightCountries}
            </span>

            {/* Lived In */}
            <SettingRow
              label={MAP_SETTINGS_LABELS.tripsTab.livedIn}
              icon={
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <House size={16} weight="bold" />
                </div>
              }
              control={
                <GlassToggle
                  checked={settings.showLivedCountries !== false}
                  accentColor="emerald"
                  onChange={(val) => onChangeSetting('showLivedCountries', val)}
                  ariaLabel={MAP_SETTINGS_LABELS.tripsTab.livedIn}
                />
              }
            />

            {/* Layovers Only */}
            <SettingRow
              label={MAP_SETTINGS_LABELS.tripsTab.layoversOnly}
              icon={
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <AirplaneLanding size={16} weight="bold" />
                </div>
              }
              control={
                <GlassToggle
                  checked={settings.showLayoverCountries !== false}
                  accentColor="amber"
                  onChange={(val) => onChangeSetting('showLayoverCountries', val)}
                  ariaLabel={MAP_SETTINGS_LABELS.tripsTab.layoversOnly}
                />
              }
            />

            {/* Wishlist */}
            <SettingRow
              label={MAP_SETTINGS_LABELS.tripsTab.wishlist}
              icon={
                <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
                  <Star size={16} weight="bold" />
                </div>
              }
              control={
                <GlassToggle
                  checked={settings.showWishlistCountries !== false}
                  accentColor="rose"
                  onChange={(val) => onChangeSetting('showWishlistCountries', val)}
                  ariaLabel={MAP_SETTINGS_LABELS.tripsTab.wishlist}
                />
              }
            />
          </div>
        </SettingsSection>
      )}

      {/* 3. AIRPORTS (hidden in Scratch view) */}
      {!isScratchMode && (
        <SettingsSection title={MAP_SETTINGS_LABELS.tripsTab.airportsSection}>
          {/* Airport Size */}
          <div className="space-y-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
              {MAP_SETTINGS_LABELS.tripsTab.airportSize}
            </span>
            <GlassSegmented<'off' | 'small' | 'medium' | 'large'>
              options={[
                { id: 'off', label: MAP_SETTINGS_LABELS.tripsTab.sizeOff },
                { id: 'small', label: MAP_SETTINGS_LABELS.tripsTab.sizeSmall },
                { id: 'medium', label: MAP_SETTINGS_LABELS.tripsTab.sizeMedium },
                { id: 'large', label: MAP_SETTINGS_LABELS.tripsTab.sizeLarge },
              ]}
              value={settings.airportSize || 'medium'}
              onChange={(val) => onChangeSetting('airportSize', val)}
              columns={4}
            />
          </div>

          {/* Size by Traffic */}
          <SettingRow
            label={MAP_SETTINGS_LABELS.tripsTab.sizeByTraffic}
            control={
              <GlassToggle
                checked={settings.airportMode === 'frequency'}
                onChange={(checked) =>
                  onChangeSetting('airportMode', checked ? 'frequency' : 'uniform')
                }
                ariaLabel={MAP_SETTINGS_LABELS.tripsTab.sizeByTraffic}
              />
            }
          />

          {/* Runway Detail */}
          <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
              {MAP_SETTINGS_LABELS.tripsTab.runwayDetail}
            </span>
            <GlassSegmented<'standard' | 'detailed'>
              options={[
                { id: 'standard', label: MAP_SETTINGS_LABELS.tripsTab.detailSimple },
                { id: 'detailed', label: MAP_SETTINGS_LABELS.tripsTab.detailDetailed },
              ]}
              value={settings.airportDetail || 'detailed'}
              onChange={(val) => onChangeSetting('airportDetail', val)}
              columns={2}
            />
          </div>

          {/* Airports Only */}
          <div className="pt-2 border-t border-black/5 dark:border-white/5">
            <SettingRow
              label={MAP_SETTINGS_LABELS.tripsTab.airportsOnly}
              helper={MAP_SETTINGS_LABELS.tripsTab.airportsOnlyHelper}
              control={
                <GlassToggle
                  checked={Boolean(settings.airportsOnly)}
                  onChange={(val) => onChangeSetting('airportsOnly', val)}
                  ariaLabel={MAP_SETTINGS_LABELS.tripsTab.airportsOnly}
                />
              }
            />
          </div>
        </SettingsSection>
      )}

      {/* 4. ROUTES (hidden in Scratch view) */}
      {!isScratchMode && (
        <SettingsSection title={MAP_SETTINGS_LABELS.tripsTab.routesSection}>
          {/* Route Color */}
          <div className="space-y-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
              {MAP_SETTINGS_LABELS.tripsTab.routesColor}
            </span>
            <GlassSegmented<'gradient' | 'frequency' | 'default'>
              options={[
                { id: 'gradient', label: MAP_SETTINGS_LABELS.tripsTab.colorGradient },
                { id: 'frequency', label: MAP_SETTINGS_LABELS.tripsTab.colorByFrequency },
                { id: 'default', label: MAP_SETTINGS_LABELS.tripsTab.colorSingle },
              ]}
              value={settings.routeColorMode || 'gradient'}
              onChange={(val) => onChangeSetting('routeColorMode', val)}
              columns={3}
            />
          </div>

          {/* Route Thickness */}
          <div className="space-y-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary block">
              {MAP_SETTINGS_LABELS.tripsTab.thickness}
            </span>
            <GlassSegmented<'thin' | 'normal' | 'thick'>
              options={[
                { id: 'thin', label: MAP_SETTINGS_LABELS.tripsTab.thicknessThin },
                { id: 'normal', label: MAP_SETTINGS_LABELS.tripsTab.thicknessMedium },
                { id: 'thick', label: MAP_SETTINGS_LABELS.tripsTab.thicknessThick },
              ]}
              value={settings.routeScale || 'normal'}
              onChange={(val) => onChangeSetting('routeScale', val)}
              columns={3}
            />
          </div>

          {/* Animate routes (only if onToggleAnimateRoutes provided) */}
          {onToggleAnimateRoutes && (
            <div className="pt-2 border-t border-black/5 dark:border-white/5">
              <SettingRow
                label={MAP_SETTINGS_LABELS.tripsTab.animateRoutes}
                control={
                  <GlassToggle
                    checked={Boolean(animateRoutes)}
                    onChange={onToggleAnimateRoutes}
                    ariaLabel={MAP_SETTINGS_LABELS.tripsTab.animateRoutes}
                  />
                }
              />
            </div>
          )}

          {/* Group nearby airports (only if onToggleClusterMode provided) */}
          {onToggleClusterMode && (
            <div className="pt-2 border-t border-black/5 dark:border-white/5">
              <SettingRow
                label={MAP_SETTINGS_LABELS.tripsTab.groupAirports}
                control={
                  <GlassToggle
                    checked={Boolean(clusterMode)}
                    onChange={onToggleClusterMode}
                    ariaLabel={MAP_SETTINGS_LABELS.tripsTab.groupAirports}
                  />
                }
              />
            </div>
          )}

          {/* Follow roads & rails */}
          <div className="pt-2 border-t border-black/5 dark:border-white/5">
            <SettingRow
              label={MAP_SETTINGS_LABELS.tripsTab.followRoadsAndRails}
              control={
                <GlassToggle
                  checked={
                    onToggleRoadTracing
                      ? Boolean(showRoadTracing ?? settings.routeTracing !== false)
                      : settings.routeTracing !== false
                  }
                  onChange={() => {
                    if (onToggleRoadTracing) {
                      onToggleRoadTracing();
                    } else {
                      onChangeSetting('routeTracing', settings.routeTracing === false);
                    }
                  }}
                  ariaLabel={MAP_SETTINGS_LABELS.tripsTab.followRoadsAndRails}
                />
              }
            />
          </div>
        </SettingsSection>
      )}
    </div>
  );
};

export default TripsTab;
