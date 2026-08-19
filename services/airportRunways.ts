// Airport Detailed Runway & Markings Geometry Generator for Deck.gl

export interface RunwayStrip {
    id: string;
    heading: number; // True heading in degrees (0-360)
    lengthMeters: number;
    widthMeters: number;
    offsetMetersX: number; // Lateral offset from airport center
    offsetMetersY: number; // Longitudinal offset
    designator1: string; // e.g. "09L"
    designator2: string; // e.g. "27R"
}

export interface RunwayGeometry {
    id: string;
    iata: string;
    center: [number, number]; // [lng, lat]
    runwayPaths: {
        stripPath: [number, number, number][];
        centerlinePath: [number, number, number][];
        widthMeters: number;
        designator: string;
    }[];
    taxiwayPaths: [number, number, number][][];
    thresholdMarkings: [number, number, number][][];
}

// True Runway Database for Major Global Airports
const AIRPORT_RUNWAY_DATABASE: Record<string, RunwayStrip[]> = {
    // London Heathrow (LHR) - 2 parallel E-W runways
    LHR: [
        { id: '09L-27R', heading: 90, lengthMeters: 3902, widthMeters: 50, offsetMetersX: 0, offsetMetersY: -700, designator1: '09L', designator2: '27R' },
        { id: '09R-27L', heading: 90, lengthMeters: 3658, widthMeters: 50, offsetMetersX: 0, offsetMetersY: 700, designator1: '09R', designator2: '27L' },
    ],
    // New York JFK - 4 intersecting runways
    JFK: [
        { id: '04L-22R', heading: 44, lengthMeters: 3682, widthMeters: 60, offsetMetersX: -600, offsetMetersY: 0, designator1: '04L', designator2: '22R' },
        { id: '04R-22L', heading: 44, lengthMeters: 2560, widthMeters: 45, offsetMetersX: 600, offsetMetersY: 0, designator1: '04R', designator2: '22L' },
        { id: '13L-31R', heading: 134, lengthMeters: 4423, widthMeters: 60, offsetMetersX: 0, offsetMetersY: -400, designator1: '13L', designator2: '31R' },
        { id: '13R-31L', heading: 134, lengthMeters: 3048, widthMeters: 45, offsetMetersX: 0, offsetMetersY: 500, designator1: '13R', designator2: '31L' },
    ],
    // Los Angeles (LAX) - 4 parallel runways
    LAX: [
        { id: '06L-24R', heading: 69, lengthMeters: 2720, widthMeters: 45, offsetMetersX: 0, offsetMetersY: -800, designator1: '06L', designator2: '24R' },
        { id: '06R-24L', heading: 69, lengthMeters: 3125, widthMeters: 45, offsetMetersX: 0, offsetMetersY: -550, designator1: '06R', designator2: '24L' },
        { id: '07L-25R', heading: 69, lengthMeters: 3939, widthMeters: 60, offsetMetersX: 0, offsetMetersY: 550, designator1: '07L', designator2: '25R' },
        { id: '07R-25L', heading: 69, lengthMeters: 3382, widthMeters: 45, offsetMetersX: 0, offsetMetersY: 800, designator1: '07R', designator2: '25L' },
    ],
    // Paris Charles de Gaulle (CDG) - 4 parallel runways in 2 pairs
    CDG: [
        { id: '09L-27R', heading: 86, lengthMeters: 2700, widthMeters: 60, offsetMetersX: 0, offsetMetersY: -1400, designator1: '09L', designator2: '27R' },
        { id: '09R-27L', heading: 86, lengthMeters: 4215, widthMeters: 45, offsetMetersX: 0, offsetMetersY: -1000, designator1: '09R', designator2: '27L' },
        { id: '08L-26R', heading: 86, lengthMeters: 4200, widthMeters: 45, offsetMetersX: 0, offsetMetersY: 1000, designator1: '08L', designator2: '26R' },
        { id: '08R-26L', heading: 86, lengthMeters: 2700, widthMeters: 60, offsetMetersX: 0, offsetMetersY: 1400, designator1: '08R', designator2: '26L' },
    ],
    // Dubai International (DXB) - 2 parallel runways
    DXB: [
        { id: '12L-30R', heading: 120, lengthMeters: 4000, widthMeters: 60, offsetMetersX: 0, offsetMetersY: -450, designator1: '12L', designator2: '30R' },
        { id: '12R-30L', heading: 120, lengthMeters: 4450, widthMeters: 60, offsetMetersX: 0, offsetMetersY: 450, designator1: '12R', designator2: '30L' },
    ],
    // Frankfurt (FRA) - 4 runways
    FRA: [
        { id: '07L-25R', heading: 70, lengthMeters: 2800, widthMeters: 45, offsetMetersX: 0, offsetMetersY: -800, designator1: '07L', designator2: '25R' },
        { id: '07C-25C', heading: 70, lengthMeters: 4000, widthMeters: 60, offsetMetersX: 0, offsetMetersY: 0, designator1: '07C', designator2: '25C' },
        { id: '07R-25L', heading: 70, lengthMeters: 4000, widthMeters: 45, offsetMetersX: 0, offsetMetersY: 500, designator1: '07R', designator2: '25L' },
        { id: '18', heading: 180, lengthMeters: 4000, widthMeters: 45, offsetMetersX: -1200, offsetMetersY: 800, designator1: '18', designator2: '36' },
    ],
    // Amsterdam Schiphol (AMS) - 6 converging runways
    AMS: [
        { id: '18R-36L', heading: 183, lengthMeters: 3800, widthMeters: 45, offsetMetersX: -2000, offsetMetersY: 0, designator1: '18R', designator2: '36L' },
        { id: '06-24', heading: 58, lengthMeters: 3500, widthMeters: 45, offsetMetersX: 500, offsetMetersY: 500, designator1: '06', designator2: '24' },
        { id: '09-27', heading: 87, lengthMeters: 3453, widthMeters: 45, offsetMetersX: 0, offsetMetersY: -800, designator1: '09', designator2: '27' },
        { id: '18C-36C', heading: 183, lengthMeters: 3300, widthMeters: 45, offsetMetersX: 0, offsetMetersY: 0, designator1: '18C', designator2: '36C' },
    ],
    // Singapore Changi (SIN) - 3 parallel runways
    SIN: [
        { id: '02L-20R', heading: 22, lengthMeters: 4000, widthMeters: 60, offsetMetersX: -800, offsetMetersY: 0, designator1: '02L', designator2: '20R' },
        { id: '02C-20C', heading: 22, lengthMeters: 4000, widthMeters: 60, offsetMetersX: 800, offsetMetersY: 0, designator1: '02C', designator2: '20C' },
        { id: '02R-20L', heading: 22, lengthMeters: 4000, widthMeters: 60, offsetMetersX: 1800, offsetMetersY: 0, designator1: '02R', designator2: '20L' },
    ],
    // Tokyo Haneda (HND) - 4 runways
    HND: [
        { id: '16R-34L', heading: 157, lengthMeters: 3000, widthMeters: 60, offsetMetersX: -600, offsetMetersY: 0, designator1: '16R', designator2: '34L' },
        { id: '16L-34R', heading: 157, lengthMeters: 3360, widthMeters: 60, offsetMetersX: 800, offsetMetersY: 0, designator1: '16L', designator2: '34R' },
        { id: '04-22', heading: 43, lengthMeters: 2500, widthMeters: 60, offsetMetersX: 0, offsetMetersY: -600, designator1: '04', designator2: '22' },
        { id: '05-23', heading: 47, lengthMeters: 2500, widthMeters: 60, offsetMetersX: 0, offsetMetersY: 1000, designator1: '05', designator2: '23' },
    ],
    // San Francisco (SFO) - 4 intersecting parallel pairs
    SFO: [
        { id: '28L-10R', heading: 284, lengthMeters: 3470, widthMeters: 60, offsetMetersX: 0, offsetMetersY: -250, designator1: '28L', designator2: '10R' },
        { id: '28R-10L', heading: 284, lengthMeters: 3618, widthMeters: 60, offsetMetersX: 0, offsetMetersY: 250, designator1: '28R', designator2: '10L' },
        { id: '01L-19R', heading: 14, lengthMeters: 2636, widthMeters: 60, offsetMetersX: -300, offsetMetersY: 0, designator1: '01L', designator2: '19R' },
        { id: '01R-19L', heading: 14, lengthMeters: 2332, widthMeters: 60, offsetMetersX: 300, offsetMetersY: 0, designator1: '01R', designator2: '19L' },
    ],
    // Atlanta Hartsfield-Jackson (ATL) - 5 parallel E-W runways
    ATL: [
        { id: '08L-26R', heading: 92, lengthMeters: 2743, widthMeters: 45, offsetMetersX: 0, offsetMetersY: -1000, designator1: '08L', designator2: '26R' },
        { id: '08R-26L', heading: 92, lengthMeters: 3048, widthMeters: 45, offsetMetersX: 0, offsetMetersY: -650, designator1: '08R', designator2: '26L' },
        { id: '09L-27R', heading: 92, lengthMeters: 3776, widthMeters: 45, offsetMetersX: 0, offsetMetersY: 300, designator1: '09L', designator2: '27R' },
        { id: '09R-27L', heading: 92, lengthMeters: 2743, widthMeters: 45, offsetMetersX: 0, offsetMetersY: 650, designator1: '09R', designator2: '27L' },
        { id: '10-28', heading: 92, lengthMeters: 2743, widthMeters: 45, offsetMetersX: 0, offsetMetersY: 1300, designator1: '10', designator2: '28' },
    ],
    // Beirut (BEY)
    BEY: [
        { id: '16-34', heading: 165, lengthMeters: 3800, widthMeters: 45, offsetMetersX: -300, offsetMetersY: 0, designator1: '16', designator2: '34' },
        { id: '17-35', heading: 175, lengthMeters: 3395, widthMeters: 45, offsetMetersX: 400, offsetMetersY: 0, designator1: '17', designator2: '35' },
        { id: '03-21', heading: 32, lengthMeters: 3250, widthMeters: 45, offsetMetersX: 0, offsetMetersY: -400, designator1: '03', designator2: '21' },
    ],
    // Doha Hamad (DOH)
    DOH: [
        { id: '16L-34R', heading: 157, lengthMeters: 4250, widthMeters: 60, offsetMetersX: -900, offsetMetersY: 0, designator1: '16L', designator2: '34R' },
        { id: '16R-34L', heading: 157, lengthMeters: 4850, widthMeters: 60, offsetMetersX: 900, offsetMetersY: 0, designator1: '16R', designator2: '34L' },
    ],
    // Istanbul (IST)
    IST: [
        { id: '16L-34R', heading: 164, lengthMeters: 3750, widthMeters: 60, offsetMetersX: -1200, offsetMetersY: 0, designator1: '16L', designator2: '34R' },
        { id: '16R-34L', heading: 164, lengthMeters: 3750, widthMeters: 45, offsetMetersX: -700, offsetMetersY: 0, designator1: '16R', designator2: '34L' },
        { id: '17L-35R', heading: 174, lengthMeters: 4100, widthMeters: 60, offsetMetersX: 700, offsetMetersY: 0, designator1: '17L', designator2: '35R' },
        { id: '17R-35L', heading: 174, lengthMeters: 4100, widthMeters: 45, offsetMetersX: 1200, offsetMetersY: 0, designator1: '17R', designator2: '35L' },
    ]
};

// Offset helper in meters
function offsetLatLng(lat: number, lng: number, dxMeters: number, dyMeters: number): [number, number] {
    const latOffset = dyMeters / 111111;
    const lngOffset = dxMeters / (111111 * Math.cos(lat * Math.PI / 180));
    return [lng + lngOffset, lat + latOffset];
}

/**
 * Generates high-accuracy realistic airport runway and taxiway geometries.
 */
export function generateAirportRunway(
    code: string,
    lat: number,
    lng: number,
    fallbackHeading: number = 45
): RunwayGeometry {
    const cleanCode = (code || '').toUpperCase().trim();
    const knownStrips = AIRPORT_RUNWAY_DATABASE[cleanCode];

    const strips: RunwayStrip[] = knownStrips || [
        {
            id: 'main',
            heading: fallbackHeading,
            lengthMeters: 3200,
            widthMeters: 45,
            offsetMetersX: 0,
            offsetMetersY: 0,
            designator1: `${Math.round(fallbackHeading / 10).toString().padStart(2, '0')}`,
            designator2: `${Math.round(((fallbackHeading + 180) % 360) / 10).toString().padStart(2, '0')}`
        }
    ];

    const runwayPaths: RunwayGeometry['runwayPaths'] = [];
    const taxiwayPaths: [number, number, number][][] = [];
    const thresholdMarkings: [number, number, number][][] = [];

    strips.forEach((strip) => {
        const rad = (strip.heading * Math.PI) / 180;
        const perpRad = rad + Math.PI / 2;
        const halfLen = strip.lengthMeters / 2;

        // Apply runway center offset
        const [centerLng, centerLat] = offsetLatLng(lat, lng, strip.offsetMetersX, strip.offsetMetersY);

        const dx = Math.sin(rad) * halfLen;
        const dy = Math.cos(rad) * halfLen;

        const [startLng, startLat] = offsetLatLng(centerLat, centerLng, -dx, -dy);
        const [endLng, endLat] = offsetLatLng(centerLat, centerLng, dx, dy);

        // Runway Pavement Strip
        const stripPath: [number, number, number][] = [
            [startLng, startLat, 0],
            [endLng, endLat, 0]
        ];

        // Runway Centerline
        const centerlinePath: [number, number, number][] = [
            [startLng, startLat, 0],
            [endLng, endLat, 0]
        ];

        runwayPaths.push({
            stripPath,
            centerlinePath,
            widthMeters: strip.widthMeters,
            designator: `${strip.designator1}/${strip.designator2}`
        });

        // Parallel Taxiway (180m offset)
        const taxiwayOffset = 180;
        const taxDx = Math.sin(perpRad) * taxiwayOffset;
        const taxDy = Math.cos(perpRad) * taxiwayOffset;

        const [taxStartLng, taxStartLat] = offsetLatLng(startLat, startLng, taxDx, taxDy);
        const [taxMidLng, taxMidLat] = offsetLatLng(centerLat, centerLng, taxDx, taxDy);
        const [taxEndLng, taxEndLat] = offsetLatLng(endLat, endLng, taxDx, taxDy);

        // High-speed exit turn connects to taxiway
        const [exit1Lng, exit1Lat] = offsetLatLng(centerLat, centerLng, -dx * 0.3, -dy * 0.3);
        const [exit2Lng, exit2Lat] = offsetLatLng(centerLat, centerLng, dx * 0.3, dy * 0.3);

        taxiwayPaths.push([
            [taxStartLng, taxStartLat, 0],
            [exit1Lng, exit1Lat, 0],
            [taxMidLng, taxMidLat, 0],
            [exit2Lng, exit2Lat, 0],
            [taxEndLng, taxEndLat, 0]
        ]);

        // Piano Key Threshold Stripes at runway ends
        const stripeCount = 4;
        const stripeSpacing = 18; // meters
        for (let i = -stripeCount; i <= stripeCount; i++) {
            const px = Math.sin(perpRad) * (i * stripeSpacing);
            const py = Math.cos(perpRad) * (i * stripeSpacing);

            // Threshold 1
            const [t1StartLng, t1StartLat] = offsetLatLng(startLat, startLng, px - dx * 0.03, py - dy * 0.03);
            const [t1EndLng, t1EndLat] = offsetLatLng(startLat, startLng, px + dx * 0.03, py + dy * 0.03);
            thresholdMarkings.push([
                [t1StartLng, t1StartLat, 0],
                [t1EndLng, t1EndLat, 0]
            ]);

            // Threshold 2
            const [t2StartLng, t2StartLat] = offsetLatLng(endLat, endLng, px - dx * 0.03, py - dy * 0.03);
            const [t2EndLng, t2EndLat] = offsetLatLng(endLat, endLng, px + dx * 0.03, py + dy * 0.03);
            thresholdMarkings.push([
                [t2StartLng, t2StartLat, 0],
                [t2EndLng, t2EndLat, 0]
            ]);
        }
    });

    return {
        id: `runway-${cleanCode}`,
        iata: cleanCode,
        center: [lng, lat],
        runwayPaths,
        taxiwayPaths,
        thresholdMarkings
    };
}
