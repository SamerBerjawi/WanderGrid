// RainViewer API Service for Live Global Rain/Precipitation Radar Layer

export interface RainRadarMetadata {
    tileUrl: string;
    timestamp: number;
    formattedTime: string;
    relativeTime: string;
    colorScheme: number;
}

interface RainViewerRadarFrame {
    time: number;
    path: string;
}

interface RainViewerResponse {
    version: string;
    generated: number;
    host: string;
    radar: {
        past?: RainViewerRadarFrame[];
        nowcast?: RainViewerRadarFrame[];
    };
}

interface RainViewerFrameCache {
    host: string;
    basePath: string;
    time: number;
}

let cachedFrame: RainViewerFrameCache | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache

/**
 * Builds the exact RainViewer tile URL pattern from frame data and options.
 */
function buildTilePattern(host: string, basePath: string, colorScheme: number, smooth: number, snow: number): string {
    if (basePath.includes('{z}')) {
        return `${host}${basePath}`;
    }
    // RainViewer URL pattern: {host}{path}/256/{z}/{x}/{y}/{colorScheme}/{smooth}_{snow}.png
    return `${host}${basePath}/256/{z}/{x}/{y}/${colorScheme}/${smooth}_${snow}.png`;
}

/**
 * Builds the full RainRadarMetadata object from cached frame and requested colorScheme.
 */
function formatMetadata(frame: RainViewerFrameCache, colorScheme: number, smooth: number, snow: number): RainRadarMetadata {
    const now = Date.now();
    const frameDate = new Date(frame.time * 1000);
    const minutesAgo = Math.max(0, Math.round((now - frameDate.getTime()) / 60000));

    return {
        tileUrl: buildTilePattern(frame.host, frame.basePath, colorScheme, smooth, snow),
        timestamp: frame.time,
        formattedTime: frameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        relativeTime: minutesAgo === 0 ? 'Just now' : `${minutesAgo}m ago`,
        colorScheme
    };
}

/**
 * Fetches the latest precipitation radar metadata & tile URL from RainViewer API,
 * dynamically generating tile URLs according to the requested color scheme.
 */
export async function getLatestRainRadarMetadata(
    colorScheme: number = 2, // 2 = Universal (rainbow), 1 = Original/Classic, 6 = NEXRAD, 4 = Weather Channel
    smooth: number = 1,
    snow: number = 1
): Promise<RainRadarMetadata | null> {
    const now = Date.now();

    // If we have cached frame coordinates and it's fresh, compute the new tileUrl immediately
    if (cachedFrame && (now - lastFetchTime) < CACHE_TTL_MS) {
        return formatMetadata(cachedFrame, colorScheme, smooth, snow);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
        const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`RainViewer API returned ${res.status}`);

        const data: RainViewerResponse = await res.json();
        const host = data.host || 'https://tilecache.rainviewer.com';
        const pastFrames = data.radar?.past || [];
        
        if (pastFrames.length > 0) {
            const latest = pastFrames[pastFrames.length - 1];
            cachedFrame = {
                host,
                basePath: latest.path,
                time: latest.time
            };
            lastFetchTime = now;
            return formatMetadata(cachedFrame, colorScheme, smooth, snow);
        }
    } catch (err) {
        console.warn('RainViewer fetch error or timeout:', err);
    } finally {
        clearTimeout(timeoutId);
    }

    if (cachedFrame) {
        return formatMetadata(cachedFrame, colorScheme, smooth, snow);
    }

    return null;
}

export async function getLatestRainRadarTileUrl(colorScheme: number = 2): Promise<string | null> {
    const meta = await getLatestRainRadarMetadata(colorScheme);
    return meta ? meta.tileUrl : null;
}
