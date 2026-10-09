import React from 'react';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { MapSettingsPanel, MapSettingsPanelProps } from './mapSettings/MapSettingsPanel';
import { MapAppearanceModalLegacy } from './MapAppearanceModalLegacy';
import { MapAppearanceSettings } from '../types/mapAppearance';

export type MapAppearanceModalProps = MapSettingsPanelProps;

/**
 * MapAppearanceModal — thin router between the new Liquid Glass MapSettingsPanel
 * and MapAppearanceModalLegacy, controlled by FEATURE_FLAGS.MC_NEW_PANEL.
 */
export const MapAppearanceModal: React.FC<MapAppearanceModalProps> = (props) => {
  if (FEATURE_FLAGS.MC_NEW_PANEL) {
    return <MapSettingsPanel {...props} />;
  }
  return <MapAppearanceModalLegacy {...props} />;
};

export default MapAppearanceModal;
