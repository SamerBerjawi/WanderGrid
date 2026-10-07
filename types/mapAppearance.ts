export type BasemapMode = 'default' | 'onyx' | 'snow' | 'vibrant' | 'satellite' | 'ocean' | 'citylights';

export const getEffectiveBasemap = (
    basemap: string | undefined,
    isDark: boolean,
    defaultLight?: string,
    defaultDark?: string
): 'onyx' | 'citylights' | 'satellite' | 'snow' | 'vibrant' | 'ocean' => {
    // If an explicit layer style other than 'default' is requested, respect it unconditionally
    if (basemap && basemap !== 'default') {
        if (
            basemap === 'onyx' ||
            basemap === 'citylights' ||
            basemap === 'satellite' ||
            basemap === 'snow' ||
            basemap === 'vibrant' ||
            basemap === 'ocean'
        ) {
            return basemap;
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
        if (resolvedDark === 'ocean') return 'ocean';
        if (resolvedDark === 'snow') return 'snow';
        if (resolvedDark === 'vibrant') return 'vibrant';
        return 'onyx';
    } else {
        if (resolvedLight === 'vibrant') return 'vibrant';
        if (resolvedLight === 'ocean') return 'ocean';
        if (resolvedLight === 'satellite') return 'satellite';
        if (resolvedLight === 'citylights') return 'citylights';
        if (resolvedLight === 'onyx') return 'onyx';
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
    atmosphere?: boolean; // Subtle 3D globe atmospheric glow, stars & solar cosmos
    rainRadar: boolean; // Latest RainViewer or NOAA precipitation
    rainRadarOpacity?: number; // 0.2 to 1.0
    rainRadarColorScheme?: number; // 1 to 8
    radarSource?: 'rainviewer' | 'noaa_mrms'; // RainViewer (Global) vs NOAA nowCOAST MRMS (North America HD)
    weatherClouds?: boolean; // NOAA nowCOAST Global Infrared Satellite Clouds
    weatherCloudsOpacity?: number; // 0.2 to 1.0

    // OpenAIP Aeronautical Chart Overlay
    openAipOverlay?: boolean;
    openAipGroups?: ('airspaces' | 'airspaceLabels' | 'airports' | 'navaids' | 'reportingPoints')[];

    // Terrain, Elevation & Infrastructure Overlays
    terrainHillshade?: boolean; // Esri World Hillshade 3D relief shading
    terrainHillshadeOpacity?: number; // 0.1 to 1.0
    transitOverlay?: boolean; // OpenRailwayMap global transit & rail infrastructure
    transitOverlayOpacity?: number; // 0.1 to 1.0

    // Motion & Animation Optimization
    flightInterpolation?: boolean; // Smooth flight progress interpolation

    // Scratch Map Mode Filters & Toggles
    scratchCitySize?: 'off' | 'small' | 'medium' | 'large';
    showLivedCountries?: boolean; // Show/hide lived (current & past) residence highlights
    showWishlistCountries?: boolean; // Show/hide dream wishlist targets
    showLayoverCountries?: boolean; // Show/hide layover-only transit territories
}

export const DEFAULT_MAP_APPEARANCE: MapAppearanceSettings = {
    basemap: 'default',
    airportDetail: 'detailed',
    projection: 'flat',
    airportSize: 'medium',
    airportMode: 'frequency',
    routeWidthMode: 'frequency',
    routeScale: 'normal',
    routeColorMode: 'gradient',
    routeTracing: true,
    timeOfDay: false,
    atmosphere: true,
    rainRadar: false,
    rainRadarOpacity: 0.85,
    rainRadarColorScheme: 2,
    radarSource: 'rainviewer',
    weatherClouds: false,
    weatherCloudsOpacity: 0.75,
    openAipOverlay: false,
    openAipGroups: ['airspaces', 'airspaceLabels', 'airports', 'navaids', 'reportingPoints'],
    terrainHillshade: false,
    terrainHillshadeOpacity: 0.6,
    transitOverlay: false,
    transitOverlayOpacity: 0.75,
    flightInterpolation: true,
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
            if (parsed.airportDetail === 'standard' && !localStorage.getItem('wandergrid_user_customized_airport_detail')) {
                parsed.airportDetail = 'detailed';
            }
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
