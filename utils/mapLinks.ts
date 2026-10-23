/**
 * Links that open the New map focused on something (UI_UX_DESIGN_REFERENCE.md §5.0). Other pages use
 * these instead of building query strings. MapNew is the page at /map.
 *
 *   ?route=JFK-CDG       select that route (either direction) and frame it
 *   ?trip=<tripId>       frame the trip and emphasise its routes
 *   ?focus=lat,lng,zoom  fly to a point
 */
export const MAP_PATH = '/map';

export interface MapLinkOptions {
    /** Origin and destination as stored on the transport (IATA code or place name). */
    route?: [string, string];
    tripId?: string;
    focus?: { lat: number; lng: number; zoom?: number };
}

export const mapLink = ({ route, tripId, focus }: MapLinkOptions = {}): string => {
    const params = new URLSearchParams();
    if (route) params.set('route', `${route[0].trim().toUpperCase()}-${route[1].trim().toUpperCase()}`);
    if (tripId) params.set('trip', tripId);
    if (focus) params.set('focus', [focus.lat, focus.lng, focus.zoom].filter(v => v !== undefined).map(v => Number(v).toFixed(4).replace(/\.?0+$/, '')).join(','));
    const query = params.toString();
    return query ? `${MAP_PATH}?${query}` : MAP_PATH;
};

export interface MapLinkTarget {
    route?: [string, string];
    tripId?: string;
    focus?: { lat: number; lng: number; zoom?: number };
}

/** Reads a map link's target from a query string (the inverse of `mapLink`). */
export const readMapLink = (search: string): MapLinkTarget => {
    const params = new URLSearchParams(search);
    const out: MapLinkTarget = {};
    const route = params.get('route');
    if (route) {
        // Codes are usually IATA (no hyphen); place names may contain one, so split on the last hyphen pair boundary.
        const parts = route.split('-');
        if (parts.length >= 2) {
            const mid = Math.floor(parts.length / 2);
            out.route = [parts.slice(0, mid).join('-'), parts.slice(mid).join('-')];
        }
    }
    const trip = params.get('trip');
    if (trip) out.tripId = trip;
    const focus = params.get('focus');
    if (focus) {
        const [lat, lng, zoom] = focus.split(',').map(Number);
        if (Number.isFinite(lat) && Number.isFinite(lng)) out.focus = { lat, lng, zoom: Number.isFinite(zoom) ? zoom : undefined };
    }
    return out;
};
