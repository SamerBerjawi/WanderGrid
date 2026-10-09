import { MapSettingsPanel, MapSettingsPanelProps } from './mapSettings/MapSettingsPanel';

export type MapAppearanceModalProps = MapSettingsPanelProps;

/** Map settings panel. Kept under this name so existing imports keep working. */
export const MapAppearanceModal = MapSettingsPanel;

export default MapAppearanceModal;
