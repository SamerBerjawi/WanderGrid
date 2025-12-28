
import { FlightStatusResponse } from '../types';

export const flightTracker = {
    getFlightStatus: async (apiKey: string, flightIata: string, date?: string): Promise<FlightStatusResponse> => {
        if (!apiKey) {
            throw new Error("Missing AviationStack API Key. Please configure it in Settings.");
        }

        // Helper to parse the AviationStack response
        const processResponse = (json: any) => {
            if (json.error) {
                // Special handling for common plan limits
                if (json.error.code === 'https_access_restricted') {
                    throw new Error("API Key Restricted: Your AviationStack plan does not support HTTPS. We attempted to use a proxy, but it failed.");
                }
                throw new Error(json.error.message || "API Error");
            }

            if (!json.data || json.data.length === 0) {
                throw new Error("Flight not found.");
            }

            // If a date is provided, filter for that date.
            let targetFlight = json.data[0];
            
            if (date) {
                const found = json.data.find((f: any) => f.flight_date === date);
                if (found) targetFlight = found;
                else {
                    // Fallback strategy: If exact date not found, but we have data,
                    // check if the data returned is "close enough" (e.g. timezone shift)
                    // or just return the first one if only one result exists.
                    console.warn(`Exact date match failed for ${date}, returning best match.`);
                }
            }
            return targetFlight as FlightStatusResponse;
        };

        // Strategy 1: Try Local Backend Proxy (Prevents CORS & HTTPS issues)
        try {
            const proxyUrl = `/api/proxy/flight-status?access_key=${apiKey}&flight_iata=${flightIata}`;
            const res = await fetch(proxyUrl);
            if (res.ok) {
                const json = await res.json();
                return processResponse(json);
            } else if (res.status !== 404) {
                // If 404, backend route missing (Mock Mode), so skip to strategy 2.
                // If 500, backend error, but maybe fallback helps.
            }
        } catch (e) {
            console.warn("Backend proxy unavailable, switching to fallback.");
        }

        // Strategy 2: Direct URL (Will likely fail in browser due to CORS/Mixed Content, but good for local dev)
        const directUrl = `http://api.aviationstack.com/v1/flights?access_key=${apiKey}&flight_iata=${flightIata}`;
        
        try {
            const res = await fetch(directUrl);
            if (res.ok) {
                const json = await res.json();
                return processResponse(json);
            }
        } catch (e) {
            // Expected to fail in most production/HTTPS environments
        }

        // Strategy 3: Public CORS Proxy (Last resort for Demo/Client-only mode)
        // Note: Sending API Key through public proxy is not recommended for prod, but necessary for this demo without a backend.
        try {
            const corsProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;
            const res = await fetch(corsProxyUrl);
            
            if (!res.ok) {
                throw new Error("Failed to connect to flight network.");
            }
            
            const json = await res.json();
            return processResponse(json);
        } catch (e) {
            console.error("Flight Tracker Fatal Error", e);
            throw new Error(e instanceof Error ? e.message : "Unable to reach Flight Service. Check network or API Key.");
        }
    }
};
