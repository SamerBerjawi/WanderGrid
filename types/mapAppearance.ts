export type BasemapMode =
    | 'default'
    | 'liberty'
    | 'bright'
    | 'positron'
    | 'satellite'
    | 'onyx'
    | 'citylights'
    | 'ocean'
    | 'ofm_liberty'
    | 'ofm_bright'
    | 'ofm_positron'
    | 'snow'
    | 'vibrant';

export const getEffectiveBasemap = (
    basemap: string | undefined,
    isDark: boolean,
    defaultLight?: string,
    defaultDark?: string,
    cartoApiKey?: string
): 'liberty' | 'bright' | 'positron' | 'satellite' | 'onyx' | 'citylights' | 'ocean' => {
    // Check if CARTO API key is configured
    let hasCartoKey = Boolean(cartoApiKey && cartoApiKey.trim());
    if (!hasCartoKey && typeof localStorage !== 'undefined') {
        try {
            const raw = localStorage.getItem('wandergrid_workspace_settings') || localStorage.getItem('wandergrid_settings');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.cartoApiKey && String(parsed.cartoApiKey).trim()) {
                    hasCartoKey = true;
                }
            }
        } catch {}
    }

    // Explicit layer requested other than 'default'
    if (basemap && basemap !== 'default') {
        if (basemap === 'liberty' || basemap === 'ofm_liberty') return 'liberty';
        if (basemap === 'bright' || basemap === 'ofm_bright') return 'bright';
        if (basemap === 'satellite') return 'satellite';
        if (basemap === 'citylights') return 'citylights';
        if (basemap === 'ocean') {
            return isDark ? 'ocean' : 'liberty';
        }
        if (basemap === 'positron' || basemap === 'ofm_positron' || basemap === 'snow') {
            return hasCartoKey ? 'positron' : 'liberty';
        }
        if (basemap === 'onyx') {
            return hasCartoKey ? 'onyx' : 'citylights';
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
        if (resolvedDark === 'onyx' && hasCartoKey) return 'onyx';
        if (resolvedDark === 'ocean') return 'ocean';
        if (resolvedDark === 'satellite') return 'satellite';
        if (resolvedDark === 'citylights') return 'citylights';
        return hasCartoKey ? 'onyx' : 'citylights';
    } else {
        if ((resolvedLight === 'positron' || resolvedLight === 'snow') && hasCartoKey) return 'positron';
        if (resolvedLight === 'bright' || resolvedLight === 'ofm_bright') return 'bright';
        if (resolvedLight === 'satellite') return 'satellite';
        if (resolvedLight === 'liberty' || resolvedLight === 'ofm_liberty') return 'liberty';
        return 'liberty';
    }
};

export interface MapAppearanceSettings {
    // Atlas & Cartography
    basemap: BasemapMode;
    airportDetail: 'standard' | 'detailed'; // standard circles vs detailed runway markings
    airportsOnly?: boolean; // Solo aerodrome focus: only display airports on the map (hides flights, roads, visited cities, weather & territories)
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
    rainRadar: boolean; // Global RainViewer precipitation radar
    rainRadarOpacity?: number; // 0.2 to 1.0
    rainRadarColorScheme?: number; // 1 to 8

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

    // NASA GIBS Recent Satellite (Daily True-Color Mosaic) (P-04c)
    gibsDaily?: boolean;
    gibsDailyDate?: string;
    gibsDailyOpacity?: number;

    // 3D Terrain Elevation via AWS Terrarium DEM (P-04d)
    terrain3d?: boolean;
    terrain3dExaggeration?: number;

    // Scratch Map Mode Filters & Toggles
    scratchCitySize?: 'off' | 'small' | 'medium' | 'large';
    showLivedCountries?: boolean; // Show/hide lived (current & past) residence highlights
    showWishlistCountries?: boolean; // Show/hide dream wishlist targets
    showLayoverCountries?: boolean; // Show/hide layover-only transit territories
}

export const DEFAULT_MAP_APPEARANCE: MapAppearanceSettings = {
    basemap: 'default',
    airportDetail: 'detailed',
    airportsOnly: false,
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
    openAipOverlay: false,
    openAipGroups: ['airspaces', 'airspaceLabels', 'airports', 'navaids', 'reportingPoints'],
    terrainHillshade: false,
    terrainHillshadeOpacity: 0.8,
    transitOverlay: false,
    transitOverlayOpacity: 0.4,
    gibsDaily: false,
    gibsDailyDate: '',
    gibsDailyOpacity: 0.9,
    terrain3d: false,
    terrain3dExaggeration: 1.0,
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
        window.dispatchEvent(new CustomEvent('wandergrid_map_appearance_updated', { detail: settings }));
    } catch (e) {
        console.warn('Failed to save map appearance settings:', e);
    }
};

export function getYesterdayDateString(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
}

export function adjustDateString(dateStr: string, deltaDays: number): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return getYesterdayDateString();
    d.setDate(d.getDate() + deltaDays);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (d > yesterday) return yesterday.toISOString().split('T')[0];
    return d.toISOString().split('T')[0];
}

