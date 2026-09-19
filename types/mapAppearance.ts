export type BasemapMode = 'default' | 'onyx' | 'snow' | 'vibrant' | 'satellite' | 'ocean' | 'citylights';

export const getEffectiveBasemap = (
    basemap: string | undefined,
    isDark: boolean,
    defaultLight?: string,
    defaultDark?: string
): 'onyx' | 'citylights' | 'satellite' | 'snow' | 'vibrant' | 'ocean' => {
    // If an explicit layer style other than 'default' is requested, respect it
    if (basemap && basemap !== 'default') {
        if (isDark) {
            if (basemap === 'citylights') return 'citylights';
            if (basemap === 'satellite') return 'satellite';
            if (basemap === 'onyx') return 'onyx';
        } else {
            if (basemap === 'vibrant') return 'vibrant';
            if (basemap === 'ocean') return 'ocean';
            if (basemap === 'snow') return 'snow';
        }
    }

    // Resolve from arguments or persistent workspace settings
    let resolvedLight = defaultLight;
    let resolvedDark = defaultDark;

    if (!resolvedLight || !resolvedDark) {
        try {
            const raw = typeof localStorage !== 'undefined' 
                ? (localStorage.getItem('wandergrid_workspace_settings') || localStorage.getItem('wandergrid_settings')) 
                : null;
            if (raw) {
                const parsed = JSON.parse(raw);
                if (!resolvedLight && parsed.defaultBasemapLight) resolvedLight = parsed.defaultBasemapLight;
                if (!resolvedDark && parsed.defaultBasemapDark) resolvedDark = parsed.defaultBasemapDark;
            }
        } catch {}
    }

    if (isDark) {
        if (resolvedDark === 'citylights') return 'citylights';
        if (resolvedDark === 'satellite') return 'satellite';
        return 'onyx';
    } else {
        if (resolvedLight === 'vibrant') return 'vibrant';
        if (resolvedLight === 'ocean') return 'ocean';
        return 'snow';
    }
};

export interface MapAppearanceSettings {
    // Atlas & Cartography
    basemap: BasemapMode;
    airportDetail: 'standard' | 'detailed'; // standard circles vs detailed runway markings
    projection: 'flat' | 'globe';

    // Flights Tab
    airportSize: 'off' | 'small' | 'medium' | 'large';
    airportMode: 'frequency' | 'uniform';
    routeWidthMode: 'uniform' | 'frequency';
    routeScale: 'thin' | 'normal' | 'thick';
    routeColorMode: 'default' | 'frequency' | 'gradient';

    // Route Intelligence & Tracing (Road & Rail)
    routeTracing?: boolean; // Realistic road (OSRM) and rail (OSM) tracing

    // Layers Tab
    timeOfDay: boolean; // Live solar day/night shading
    rainRadar: boolean; // Latest RainViewer precipitation
    rainRadarOpacity?: number; // 0.2 to 1.0
    rainRadarColorScheme?: number; // 1 to 8

    // Scratch Map Mode Filters & Toggles
    scratchCitySize?: 'off' | 'small' | 'medium' | 'large';
    showLivedCountries?: boolean; // Show/hide lived (current & past) residence highlights
    showWishlistCountries?: boolean; // Show/hide dream wishlist targets
    showLayoverCountries?: boolean; // Show/hide layover-only transit territories
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
    routeTracing: true,
    timeOfDay: false,
    rainRadar: false,
    rainRadarOpacity: 0.85,
    rainRadarColorScheme: 2,
    scratchCitySize: 'medium',
    showLivedCountries: true,
    showWishlistCountries: true,
    showLayoverCountries: true,
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
