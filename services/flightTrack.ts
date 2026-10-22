/**
 * The route a flight has actually flown, from the keyless OpenSky track (through the backend proxy). OpenSky
 * only serves the current flight, so this works while a flight is in the air or just landed; "Save to this
 * flight" keeps it. Points are [longitude, latitude].
 */
export interface FlownTrack { points: [number, number][]; note?: string }

export const fetchFlownTrack = async (callsign: string): Promise<FlownTrack> => {
    const headers: Record<string, string> = {};
    try { const t = localStorage.getItem('wandergrid_session_token'); if (t) headers.Authorization = `Bearer ${t}`; } catch { /* storage unavailable */ }
    const res = await fetch(`/api/proxy/opensky/track?callsign=${encodeURIComponent(callsign)}`, { headers });
    if (!res.ok) return { points: [], note: 'The track service is not reachable.' };
    const body = await res.json() as { path?: [number, number][]; note?: string };
    return { points: (body.path || []).map(([lat, lng]) => [lng, lat] as [number, number]), note: body.note };
};
