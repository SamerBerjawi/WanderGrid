// Airport Vector Overlay Specification for WanderGrid (PMTiles + MapLibre)
// High-Contrast Aeronautical Styling for Light and Dark Modes

import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';

export const AIRPORT_SOURCE_ID = 'airport-overlay';
export const AIRPORT_PMTILES_URL = 'pmtiles:///airport-overlay.pmtiles';
export const GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

// ============================================================================
// LIGHT MODE COLOR PALETTE (High-Contrast, Aeronautical Grade)
// ============================================================================
// Aprons (tarmacs / ramps): Cool defined concrete slab clearly distinct from map terrain
const LIGHT_APRON_FILL = '#cbd5e1';          // Slate-300
const LIGHT_APRON_OUTLINE = '#94a3b8';       // Slate-400 crisp boundary

// Taxiways: Distinguished cool pavement
const LIGHT_TAXIWAY_FILL = '#b8c5d6';        // Distinct cool concrete
const LIGHT_TAXIWAY_OUTLINE = '#64748b';     // Slate-500
const LIGHT_TAXIWAY_CENTERLINE = '#f59e0b';  // Amber-500 guidance stripe

// Runways: Heavy dark asphalt for maximum contrast against light maps (>9:1 contrast)
const LIGHT_RUNWAY_FILL = '#334155';         // Slate-700 asphalt
const LIGHT_RUNWAY_OUTLINE = '#1e293b';      // Slate-800 crisp perimeter

// Markings & Paint: Brilliant white on dark asphalt
const LIGHT_MARKING = '#ffffff';

// Terminals & Jetbridges: Architectural structures with 3D drop shadow
const LIGHT_TERMINAL_FILL = '#475569';       // Slate-600
const LIGHT_TERMINAL_SHADOW = '#0f172a';     // Slate-900 shadow
const LIGHT_TERMINAL_SHADOW_OPACITY = 0.40;
const AIRPORT_TERMINAL_SHADOW_OFFSET_Z13: [number, number] = [1.5, 1.5];
const AIRPORT_TERMINAL_SHADOW_OFFSET_Z15: [number, number] = [3.5, 3.5];
const AIRPORT_TERMINAL_LABEL_SIZE_Z13 = 11.75;
const AIRPORT_TERMINAL_LABEL_SIZE_Z16 = 15.25;

// Typography & Labels: Bold, readable slate with clean white halos
const LIGHT_LABEL = '#334155';
const LIGHT_LABEL_STRONG = '#0f172a';
const LIGHT_HALO = '#ffffff';
const LIGHT_NAME = '#0f172a';

// ============================================================================
// DARK MODE COLOR PALETTE (Illuminated Aeronautical Display)
// ============================================================================
// Aprons: Aeronautical slate clearly distinguished from pitch-black terrain
const DARK_APRON_FILL = '#1e293b';           // Slate-800
const DARK_APRON_OUTLINE = '#334155';        // Slate-700

// Taxiways: Deep pavement
const DARK_TAXIWAY_FILL = '#253346';
const DARK_TAXIWAY_OUTLINE = '#3b4e65';
const DARK_TAXIWAY_CENTERLINE = '#fbbf24';   // Glowing Amber-400

// Runways: Prominent illuminated pavement strip
const DARK_RUNWAY_FILL = '#475569';          // Slate-600 illuminated runway
const DARK_RUNWAY_OUTLINE = '#64748b';       // Slate-500 border

// Markings: Luminous white
const DARK_MARKING = '#ffffff';

// Terminals: Structural slate with deep shadow
const DARK_TERMINAL_FILL = '#64748b';
const DARK_TERMINAL_SHADOW = '#020617';
const DARK_TERMINAL_SHADOW_OPACITY = 0.65;

// Typography: Crisp luminous white with deep dark halos
const DARK_LABEL = '#cbd5e1';
const DARK_LABEL_STRONG = '#f8fafc';
const DARK_HALO = '#090d16';
const DARK_NAME = '#f8fafc';

const DARK_AIRPORT_PAINT_OVERRIDES: Record<string, Record<string, any>> = {
  'airport-overlay-taxiway-outline': { 'line-color': DARK_TAXIWAY_OUTLINE },
  'airport-overlay-taxiway-line': { 'line-color': DARK_TAXIWAY_FILL },
  'airport-overlay-apron': { 'fill-color': DARK_APRON_FILL },
  'airport-overlay-apron-outline': {
    'line-color': DARK_APRON_OUTLINE,
    'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 1, 16, 1.75],
    'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 9, 0.85],
  },
  'airport-overlay-taxiway-polygon': { 'fill-color': DARK_TAXIWAY_FILL },
  'airport-overlay-taxiway-polygon-outline': { 'line-color': DARK_TAXIWAY_OUTLINE },
  'airport-overlay-runway-polygon-outline': { 'line-color': DARK_RUNWAY_OUTLINE },
  'airport-overlay-runway-polygon': { 'fill-color': DARK_RUNWAY_FILL },
  'airport-overlay-runway-outline': { 'line-color': DARK_RUNWAY_OUTLINE },
  'airport-overlay-runway-line': { 'line-color': DARK_RUNWAY_FILL },
  'airport-overlay-runway-threshold-synth': { 'line-color': DARK_MARKING },
  'airport-overlay-runway-centerline-synth': { 'line-color': DARK_MARKING },
  'airport-overlay-marking-fill': { 'fill-color': DARK_MARKING },
  'airport-overlay-marking-line': { 'line-color': DARK_MARKING },
  'airport-overlay-taxiway-centerline': { 'line-color': DARK_TAXIWAY_CENTERLINE },
  'airport-overlay-parking-position': { 'line-color': '#f59e0b' },
  'airport-overlay-terminals-shadow': {
    'fill-color': DARK_TERMINAL_SHADOW,
    'fill-opacity': DARK_TERMINAL_SHADOW_OPACITY,
  },
  'airport-overlay-terminals': { 'fill-color': DARK_TERMINAL_FILL },
  'airport-overlay-jetbridge-shadow': {
    'line-color': DARK_TERMINAL_SHADOW,
    'line-opacity': DARK_TERMINAL_SHADOW_OPACITY,
  },
  'airport-overlay-jetbridge': { 'line-color': DARK_TERMINAL_FILL },
  'airport-overlay-name-label': {
    'text-color': DARK_NAME,
    'text-halo-color': DARK_HALO,
    'text-halo-width': 2.0,
  },
  'airport-overlay-terminal-labels': {
    'text-color': DARK_LABEL_STRONG,
    'text-halo-color': DARK_HALO,
    'text-halo-width': 1.75,
  },
  'airport-overlay-taxiway-labels': {
    'text-color': DARK_LABEL,
    'text-halo-color': DARK_HALO,
    'text-halo-width': 1.5,
  },
  'airport-overlay-runway-labels': {
    'text-color': DARK_LABEL_STRONG,
    'text-halo-color': DARK_HALO,
    'text-halo-width': 1.5,
  },
  'airport-overlay-runway-designator-synth': {
    'text-color': DARK_MARKING,
    'text-halo-color': DARK_HALO,
    'text-halo-width': 1.5,
  },
  'airport-overlay-gate-label': { 'text-color': '#38bdf8' },
  'airport-overlay-navigationaid-circle': {
    'circle-color': [
      'case',
      ['==', ['get', 'light_colour'], 'red'],
      '#ef4444',
      ['==', ['get', 'light_colour'], 'green'],
      '#22c55e',
      ['==', ['get', 'light_colour'], 'yellow'],
      '#facc15',
      ['==', ['get', 'light_colour'], 'blue'],
      '#3b82f6',
      [
        'match',
        ['get', 'navigationaid'],
        ['txc', 'rwt'],
        '#22c55e',
        ['txe'],
        '#3b82f6',
        '#ffffff',
      ],
    ],
    'circle-stroke-width': 0.8,
    'circle-stroke-color': '#020617',
  },
};

const RUNWAY_WIDTH_VALUE: any = [
  'to-number',
  [
    'coalesce',
    ['get', 'width'],
    ['*', ['to-number', ['get', 'width_m']], 3.28084],
  ],
];

const taxiwayAerowayFilter: any = [
  'match',
  ['get', 'aeroway'],
  ['taxiway', 'taxilane'],
  true,
  false,
];

const terminalFilter: any = [
  'any',
  ['==', ['get', 'aeroway'], 'terminal'],
  [
    'all',
    ['==', ['get', 'aeroway'], 'jet_bridge'],
    ['==', ['geometry-type'], 'Polygon'],
  ],
];

export const getAirportGatePillImageId = (isDark: boolean) =>
  isDark ? 'airport-gate-pill-dark' : 'airport-gate-pill-light';

export const AIRPORT_ICON_DEFINITIONS = [
  { id: 'airport-gate-pill-light', path: '/airport-style/gate-pill-light@2x.png', pixelRatio: 2 },
  { id: 'airport-gate-pill-dark', path: '/airport-style/gate-pill-dark@2x.png', pixelRatio: 2 },
  { id: 'chevron-blue', path: '/airport-style/chevron-blue@2x.png', pixelRatio: 2 },
  { id: 'chevron-gray', path: '/airport-style/chevron-gray@2x.png', pixelRatio: 2 },
  { id: 'chevron-green', path: '/airport-style/chevron-green@2x.png', pixelRatio: 2 },
  { id: 'chevron-red', path: '/airport-style/chevron-red@2x.png', pixelRatio: 2 },
  { id: 'chevron-white', path: '/airport-style/chevron-white@2x.png', pixelRatio: 2 },
  { id: 'chevron-yellow', path: '/airport-style/chevron-yellow@2x.png', pixelRatio: 2 },
  { id: 'papi', path: '/airport-style/papi@2x.png', pixelRatio: 2 },
  { id: 'tower', path: '/airport-style/tower@2x.png', pixelRatio: 2 },
  { id: 'windsock', path: '/airport-style/windsock@2x.png', pixelRatio: 2 },
];

export const createAirportOverlaySource = (): SourceSpecification => ({
  type: 'vector',
  url: AIRPORT_PMTILES_URL,
  attribution: '© OpenStreetMap contributors',
});

export const createAirportOverlayLayers = (isDark: boolean): LayerSpecification[] => {
  const gatePillId = getAirportGatePillImageId(isDark);

  const rawLayers: any[] = [
    // 1. Taxiway outline (lines)
    {
      id: 'airport-overlay-taxiway-outline',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 8,
      filter: [
        'all',
        taxiwayAerowayFilter,
        ['!=', ['geometry-type'], 'Polygon'],
        ['!', ['has', 'width_m']],
      ],
      layout: { 'line-cap': 'square', 'line-join': 'miter' },
      paint: {
        'line-color': LIGHT_TAXIWAY_OUTLINE,
        'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 8, 0.4, 11, 1.75, 14, 7, 20, 28],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 8.5, 1],
      },
    },
    // 2. Taxiway line (fills)
    {
      id: 'airport-overlay-taxiway-line',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 8,
      filter: [
        'all',
        taxiwayAerowayFilter,
        ['!=', ['geometry-type'], 'Polygon'],
        ['!', ['has', 'width_m']],
      ],
      layout: { 'line-cap': 'square', 'line-join': 'miter' },
      paint: {
        'line-color': LIGHT_TAXIWAY_FILL,
        'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 8, 0.3, 11, 0.9, 14, 4, 20, 24],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 8.5, 1],
      },
    },
    // 3. Taxiway polygon outline
    {
      id: 'airport-overlay-taxiway-polygon-outline',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 8,
      filter: ['all', taxiwayAerowayFilter, ['==', ['geometry-type'], 'Polygon']],
      paint: {
        'line-color': LIGHT_TAXIWAY_OUTLINE,
        'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 8, 0.4, 12, 0.9, 16, 1.5, 20, 2.5],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 8.5, 1],
      },
    },
    // 4. Runway polygon outline
    {
      id: 'airport-overlay-runway-polygon-outline',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 7,
      filter: ['all', ['==', ['get', 'aeroway'], 'runway'], ['==', ['geometry-type'], 'Polygon']],
      paint: {
        'line-color': LIGHT_RUNWAY_OUTLINE,
        'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 8, 0.6, 12, 1.2, 16, 2, 20, 3.5],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 1],
      },
    },
    // 5. Apron fill
    {
      id: 'airport-overlay-apron',
      type: 'fill',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      filter: ['==', ['get', 'aeroway'], 'apron'],
      paint: {
        'fill-antialias': true,
        'fill-color': LIGHT_APRON_FILL,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 9, 0.92],
      },
    },
    // 6. Apron outline
    {
      id: 'airport-overlay-apron-outline',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 8,
      filter: ['==', ['get', 'aeroway'], 'apron'],
      paint: {
        'line-color': LIGHT_APRON_OUTLINE,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 1, 16, 1.75],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 9, 0.85],
      },
    },
    // 7. Taxiway polygon fill
    {
      id: 'airport-overlay-taxiway-polygon',
      type: 'fill',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 8,
      filter: ['all', taxiwayAerowayFilter, ['==', ['geometry-type'], 'Polygon']],
      paint: {
        'fill-antialias': true,
        'fill-color': LIGHT_TAXIWAY_FILL,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 8.5, 1],
      },
    },
    // 8. Runway polygon fill
    {
      id: 'airport-overlay-runway-polygon',
      type: 'fill',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 7,
      filter: ['all', ['==', ['get', 'aeroway'], 'runway'], ['==', ['geometry-type'], 'Polygon']],
      paint: {
        'fill-antialias': true,
        'fill-color': LIGHT_RUNWAY_FILL,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 1],
      },
    },
    // 9. Runway line outline
    {
      id: 'airport-overlay-runway-outline',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 7,
      filter: [
        'all',
        ['==', ['get', 'aeroway'], 'runway'],
        ['!=', ['geometry-type'], 'Polygon'],
        ['!', ['has', 'width_m']],
      ],
      layout: { 'line-cap': 'square' },
      paint: {
        'line-color': LIGHT_RUNWAY_OUTLINE,
        'line-width': [
          'interpolate',
          ['exponential', 1.2],
          ['zoom'],
          8, 0.8,
          10, 4.8,
          11, 6.5,
          14, ['case', ['any', ['has', 'width_m'], ['has', 'width']], ['+', ['*', 0.07, RUNWAY_WIDTH_VALUE], 4], 9],
          16, ['case', ['any', ['has', 'width_m'], ['has', 'width']], ['+', ['/', RUNWAY_WIDTH_VALUE, 3.28], 6], 31],
          20, ['case', ['any', ['has', 'width_m'], ['has', 'width']], ['+', ['*', 1.22, RUNWAY_WIDTH_VALUE], 8], 99],
        ],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 1],
      },
    },
    // 10. Runway line fill
    {
      id: 'airport-overlay-runway-line',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 7,
      filter: [
        'all',
        ['==', ['get', 'aeroway'], 'runway'],
        ['!=', ['geometry-type'], 'Polygon'],
        ['!', ['has', 'width_m']],
      ],
      layout: { 'line-cap': 'square' },
      paint: {
        'line-color': LIGHT_RUNWAY_FILL,
        'line-width': [
          'interpolate',
          ['exponential', 1.2],
          ['zoom'],
          8, 0.6,
          10, 2.2,
          11, 4.2,
          14, ['case', ['any', ['has', 'width_m'], ['has', 'width']], ['*', 0.07, RUNWAY_WIDTH_VALUE], 5],
          16, ['case', ['any', ['has', 'width_m'], ['has', 'width']], ['/', RUNWAY_WIDTH_VALUE, 3.28], 23],
          20, ['case', ['any', ['has', 'width_m'], ['has', 'width']], ['*', 1.22, RUNWAY_WIDTH_VALUE], 91],
        ],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 1],
      },
    },
    // 11. Runway threshold markings
    {
      id: 'airport-overlay-runway-threshold-synth',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 13,
      filter: ['==', ['get', 'aeroway'], 'runway_threshold'],
      layout: { 'line-cap': 'butt' },
      paint: {
        'line-color': LIGHT_MARKING,
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.2, 18, 4.5],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 1],
      },
    },
    // 12. Runway centerline markings
    {
      id: 'airport-overlay-runway-centerline-synth',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 13,
      filter: [
        'all',
        ['==', ['get', 'aeroway'], 'runway'],
        ['!=', ['geometry-type'], 'Polygon'],
        ['!=', ['get', 'has_osm_markings'], true],
      ],
      layout: { 'line-cap': 'butt', 'line-join': 'miter' },
      paint: {
        'line-color': LIGHT_MARKING,
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 18, 2.5],
        'line-dasharray': [16, 12],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 1],
      },
    },
    // 13. Marking polygon fill
    {
      id: 'airport-overlay-marking-fill',
      type: 'fill',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 13,
      filter: ['all', ['==', ['get', 'aeroway'], 'marking'], ['==', ['geometry-type'], 'Polygon']],
      paint: {
        'fill-antialias': true,
        'fill-color': LIGHT_MARKING,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 1],
      },
    },
    // 14. Marking lines
    {
      id: 'airport-overlay-marking-line',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 13,
      filter: ['all', ['==', ['get', 'aeroway'], 'marking'], ['!=', ['geometry-type'], 'Polygon']],
      layout: { 'line-cap': 'butt', 'line-join': 'miter' },
      paint: {
        'line-color': LIGHT_MARKING,
        'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.75, 18, 3],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 1],
      },
    },
    // 15. Taxiway centerline (aviation amber)
    {
      id: 'airport-overlay-taxiway-centerline',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 14,
      filter: ['all', taxiwayAerowayFilter, ['!=', ['geometry-type'], 'Polygon']],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': LIGHT_TAXIWAY_CENTERLINE,
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.75, 18, 2.2],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, 0.95],
      },
    },
    // 16. Parking position guides
    {
      id: 'airport-overlay-parking-position',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 14,
      filter: ['==', ['get', 'aeroway'], 'parking_position'],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': '#d97706',
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.6, 18, 1.8],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, 0.95],
      },
    },
    // 17. Terminal 3D Drop Shadows
    {
      id: 'airport-overlay-terminals-shadow',
      type: 'fill',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 13,
      filter: terminalFilter,
      paint: {
        'fill-color': LIGHT_TERMINAL_SHADOW,
        'fill-opacity': LIGHT_TERMINAL_SHADOW_OPACITY,
        'fill-translate': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13, ['literal', AIRPORT_TERMINAL_SHADOW_OFFSET_Z13],
          15, ['literal', AIRPORT_TERMINAL_SHADOW_OFFSET_Z15],
        ],
      },
    },
    // 18. Terminal buildings
    {
      id: 'airport-overlay-terminals',
      type: 'fill',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      filter: terminalFilter,
      paint: {
        'fill-antialias': true,
        'fill-color': LIGHT_TERMINAL_FILL,
      },
    },
    // 19. Jetbridge shadow
    {
      id: 'airport-overlay-jetbridge-shadow',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 15,
      filter: ['all', ['==', ['get', 'aeroway'], 'jet_bridge'], ['!=', ['geometry-type'], 'Polygon']],
      layout: { 'line-cap': 'butt' },
      paint: {
        'line-color': LIGHT_TERMINAL_SHADOW,
        'line-opacity': LIGHT_TERMINAL_SHADOW_OPACITY,
        'line-width': ['interpolate', ['linear'], ['zoom'], 15, 2, 19, 16],
        'line-translate': [
          'interpolate',
          ['linear'],
          ['zoom'],
          13, ['literal', AIRPORT_TERMINAL_SHADOW_OFFSET_Z13],
          15, ['literal', AIRPORT_TERMINAL_SHADOW_OFFSET_Z15],
        ],
      },
    },
    // 20. Jetbridge line
    {
      id: 'airport-overlay-jetbridge',
      type: 'line',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 15,
      filter: ['all', ['==', ['get', 'aeroway'], 'jet_bridge'], ['!=', ['geometry-type'], 'Polygon']],
      layout: { 'line-cap': 'butt' },
      paint: {
        'line-color': LIGHT_TERMINAL_FILL,
        'line-width': ['interpolate', ['linear'], ['zoom'], 15, 2, 19, 16],
      },
    },
    // 21. Navigation aid lights (runway end green, taxiway blue, stop red, etc.)
    {
      id: 'airport-overlay-navigationaid-circle',
      type: 'circle',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 14,
      filter: [
        'all',
        ['==', ['get', 'aeroway'], 'navigationaid'],
        ['!=', ['get', 'light_shape'], 'directed'],
        ['!=', ['get', 'navigationaid'], 'papi'],
      ],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 1.2, 18, 3],
        'circle-color': [
          'case',
          ['==', ['get', 'light_colour'], 'red'], '#ef4444',
          ['==', ['get', 'light_colour'], 'green'], '#22c55e',
          ['==', ['get', 'light_colour'], 'yellow'], '#facc15',
          ['==', ['get', 'light_colour'], 'blue'], '#3b82f6',
          ['match', ['get', 'navigationaid'], ['txc', 'rwt'], '#22c55e', ['txe'], '#3b82f6', '#ffffff'],
        ],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, 1],
        'circle-stroke-width': 0.8,
        'circle-stroke-color': '#ffffff',
      },
    },
    // 22. Directed lights (chevrons)
    {
      id: 'airport-overlay-navigationaid-directed',
      type: 'symbol',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 14,
      filter: ['all', ['==', ['get', 'aeroway'], 'navigationaid'], ['==', ['get', 'light_shape'], 'directed']],
      layout: {
        'icon-image': [
          'match',
          ['get', 'light_colour'],
          'red', 'chevron-red',
          'green', 'chevron-green',
          'yellow', 'chevron-yellow',
          'blue', 'chevron-blue',
          ['match', ['get', 'navigationaid'], 'txe', 'chevron-blue', 'chevron-white'],
        ],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 18, 1],
        'icon-anchor': 'bottom',
        'icon-rotation-alignment': 'map',
        'icon-rotate': ['coalesce', ['to-number', ['get', 'light_direction']], 0],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, 1],
      },
    },
    // 23. PAPI light symbol
    {
      id: 'airport-overlay-papi',
      type: 'symbol',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 14,
      filter: ['all', ['==', ['get', 'aeroway'], 'navigationaid'], ['==', ['get', 'navigationaid'], 'papi']],
      layout: {
        'icon-image': 'papi',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.7, 18, 1.6],
        'icon-rotation-alignment': 'map',
        'icon-rotate': ['coalesce', ['to-number', ['get', 'light_direction']], 0],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: {
        'icon-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, 1],
      },
    },
    // 24. Windsock symbol
    {
      id: 'airport-overlay-windsock',
      type: 'symbol',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 13,
      filter: ['==', ['get', 'aeroway'], 'windsock'],
      layout: {
        'icon-image': 'windsock',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 1, 18, 1.9],
        'icon-allow-overlap': true,
      },
      paint: {
        'icon-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, 1],
      },
    },
    // 25. Control Tower symbol
    {
      id: 'airport-overlay-tower',
      type: 'symbol',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 12,
      filter: ['==', ['get', 'aeroway'], 'tower'],
      layout: {
        'icon-image': 'tower',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 12, 0.7, 18, 1.6],
        'icon-allow-overlap': true,
      },
      paint: {
        'icon-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 12.5, 1],
      },
    },
    // 26. Gate Labels (with Gate Pill Badge)
    {
      id: 'airport-overlay-gate-label',
      type: 'symbol',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport_labels',
      minzoom: 15,
      filter: ['all', ['==', ['get', 'type'], 'gate'], ['has', 'name']],
      layout: {
        'icon-image': gatePillId,
        'icon-size': 1.2,
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [2, 2, 0, 2],
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
        'text-size': ['interpolate', ['exponential', 1.2], ['zoom'], 14, 8, 16, 11],
        'text-anchor': 'center',
        'icon-anchor': 'center',
        visibility: 'visible',
      },
      paint: {
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.5, 1],
        'text-color': '#1d4ed8',
        'icon-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.5, 1],
      },
    },
    // 27. Terminal Labels
    {
      id: 'airport-overlay-terminal-labels',
      type: 'symbol',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport_labels',
      minzoom: 13,
      filter: ['==', ['get', 'type'], 'terminal'],
      layout: {
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']],
        'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, AIRPORT_TERMINAL_LABEL_SIZE_Z13, 16, AIRPORT_TERMINAL_LABEL_SIZE_Z16],
        visibility: 'visible',
      },
      paint: {
        'text-color': LIGHT_LABEL_STRONG,
        'text-halo-color': LIGHT_HALO,
        'text-halo-width': 1.75,
      },
    },
    // 28. Taxiway Labels
    {
      id: 'airport-overlay-taxiway-labels',
      type: 'symbol',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 13,
      maxzoom: 24,
      filter: ['all', taxiwayAerowayFilter, ['!=', ['geometry-type'], 'Polygon']],
      layout: {
        'text-field': '{ref}',
        'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
        'text-size': ['interpolate', ['exponential', 1], ['zoom'], 13, 8, 20, 18],
        'text-anchor': 'center',
        'symbol-placement': 'line',
        visibility: 'visible',
      },
      paint: {
        'text-color': LIGHT_LABEL,
        'text-halo-color': LIGHT_HALO,
        'text-halo-width': 1.5,
      },
    },
    // 29. Runway Line Labels (when zoomed out, on the runway line)
    {
      id: 'airport-overlay-runway-labels',
      type: 'symbol',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 11,
      maxzoom: 24,
      filter: ['all', ['==', ['get', 'aeroway'], 'runway'], ['!=', ['geometry-type'], 'Polygon']],
      layout: {
        'text-field': '{ref}',
        'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
        'text-size': ['interpolate', ['exponential', 1.2], ['zoom'], 12, 9, 18, 28],
        'text-anchor': 'center',
        'symbol-placement': 'line',
        visibility: 'visible',
      },
      paint: {
        'text-color': LIGHT_MARKING,
        'text-halo-color': LIGHT_RUNWAY_OUTLINE,
        'text-halo-width': 1.5,
      },
    },
    // 30. Runway Designator Numbers (Rotated along Runway Bearing)
    {
      id: 'airport-overlay-runway-designator-synth',
      type: 'symbol',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport',
      minzoom: 14,
      maxzoom: 24,
      filter: ['==', ['get', 'aeroway'], 'runway_designator'],
      layout: {
        'text-field': ['get', 'ref'],
        'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 12, 18, 22],
        'text-rotation-alignment': 'map',
        'text-rotate': ['get', 'bearing'],
        'text-anchor': 'center',
        'text-letter-spacing': 0.15,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': LIGHT_MARKING,
        'text-halo-color': LIGHT_RUNWAY_OUTLINE,
        'text-halo-width': 1.25,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, 1],
      },
    },
    // 31. Airport Name & IATA/ICAO Label
    {
      id: 'airport-overlay-name-label',
      type: 'symbol',
      source: AIRPORT_SOURCE_ID,
      'source-layer': 'airport_nodes',
      minzoom: 9,
      filter: ['has', 'name'],
      layout: {
        'text-field': [
          'format',
          ['coalesce', ['get', 'label_name'], ['get', 'name:en'], ['get', 'name']],
          { 'font-scale': 1 },
          '\n',
          {},
          ['coalesce', ['get', 'iata'], ['get', 'icao']],
          { 'font-scale': 0.84 },
        ],
        'text-font': ['Noto Sans Bold', 'Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, 12, 12, 14, 15, 18],
        'text-line-height': 1,
        'text-letter-spacing': 0.02,
        'text-max-width': 10,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 1000],
        'text-anchor': 'center',
        'text-allow-overlap': true,
        visibility: 'visible',
      },
      paint: {
        'text-color': LIGHT_NAME,
        'text-halo-color': LIGHT_HALO,
        'text-halo-width': 2.0,
        'text-halo-blur': 0.5,
      },
    },
  ];

  if (!isDark) return rawLayers;

  // Apply dark theme overrides
  return rawLayers.map((layer) => {
    const paintOverride = DARK_AIRPORT_PAINT_OVERRIDES[layer.id];
    if (!paintOverride) return layer;
    return {
      ...layer,
      paint: {
        ...layer.paint,
        ...paintOverride,
      },
    };
  });
};
