export interface MapAppearanceSettings {
    // Map Tab
    basemap: 'default' | 'satellite' | 'topography' | 'night' | 'ocean' | 'hillshade';
    airportDetail: 'standard' | 'detailed'; // standard circles vs detailed runway markings
    projection: 'flat' | 'globe';

    // Flights Tab
    airportSize: 'off' | 'small' | 'medium' | 'large';
    airportMode: 'frequency' | 'uniform';
    routeWidthMode: 'uniform' | 'frequency';
    routeScale: 'thin' | 'normal' | 'thick';
    routeColorMode: 'default' | 'frequency' | 'gradient';

    // Layers Tab
    timeOfDay: boolean; // Live solar day/night shading
    rainRadar: boolean; // Latest RainViewer precipitation
    rainRadarOpacity?: number; // 0.2 to 1.0
    rainRadarColorScheme?: number; // 2 = Universal/Rainbow, 1 = Original, 6 = NEXRAD
}

export const DEFAULT_MAP_APPEARANCE: MapAppearanceSettings = {
    basemap: 'default',
    airportDetail: 'standard',
    projection: 'flat',
    airportSize: 'medium',
    airportMode: 'frequency',
    routeWidthMode: 'frequency',
    routeScale: 'normal',
    routeColorMode: 'gradient',
    timeOfDay: false,
    rainRadar: false,
    rainRadarOpacity: 0.85,
    rainRadarColorScheme: 2,
};

const MAP_APPEARANCE_STORAGE_KEY = 'wandergrid_map_appearance_v1';

export const loadMapAppearanceSettings = (): MapAppearanceSettings => {
    if (typeof window === 'undefined') return { ...DEFAULT_MAP_APPEARANCE };
    try {
        const stored = localStorage.getItem(MAP_APPEARANCE_STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...DEFAULT_MAP_APPEARANCE, ...parsed };
        }
    } catch (e) {
        console.warn('Failed to load map appearance settings:', e);
    }
    return { ...DEFAULT_MAP_APPEARANCE };
};

export const saveMapAppearanceSettings = (settings: MapAppearanceSettings): void => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(MAP_APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn('Failed to save map appearance settings:', e);
    }
};
