// RainViewer API Service for Live Global Rain/Precipitation Radar Layer

export interface RainRadarMetadata {
    tileUrl: string;
    timestamp: number;
    formattedTime: string;
    relativeTime: string;
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

let cachedMetadata: RainRadarMetadata | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache

/**
 * Fetches the latest precipitation radar metadata & tile URL from RainViewer API.
 */
export async function getLatestRainRadarMetadata(
    colorScheme: number = 2, // 2 = Universal (rainbow), 1 = Original, 4 = METVUW, 6 = NEXRAD
    smooth: number = 1,
    snow: number = 1
): Promise<RainRadarMetadata | null> {
    const now = Date.now();
    if (cachedMetadata && (now - lastFetchTime) < CACHE_TTL_MS) {
        return cachedMetadata;
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
            let basePath = latest.path;
            
            // Format: host + path + /256/{z}/{x}/{y}/{colorScheme}/{smooth}_{snow}.png
            let tilePattern = '';
            if (basePath.includes('{z}')) {
                tilePattern = `${host}${basePath}`;
            } else {
                tilePattern = `${host}${basePath}/256/{z}/{x}/{y}/${colorScheme}/${smooth}_${snow}.png`;
            }

            const frameDate = new Date(latest.time * 1000);
            const minutesAgo = Math.max(0, Math.round((now - frameDate.getTime()) / 60000));
            
            const meta: RainRadarMetadata = {
                tileUrl: tilePattern,
                timestamp: latest.time,
                formattedTime: frameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                relativeTime: minutesAgo === 0 ? 'Just now' : `${minutesAgo}m ago`
            };

            cachedMetadata = meta;
            lastFetchTime = now;
            return meta;
        }
    } catch (err) {
        console.warn('RainViewer fetch error or timeout:', err);
    } finally {
        clearTimeout(timeoutId);
    }

    return cachedMetadata;
}

export async function getLatestRainRadarTileUrl(): Promise<string | null> {
    const meta = await getLatestRainRadarMetadata();
    return meta ? meta.tileUrl : null;
}
