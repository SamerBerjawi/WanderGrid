import type * as maplibregl from "maplibre-gl";

export const OPENAIP_AIRSPACE_SOURCE_ID = "openaip-airspaces";

export const OPENAIP_OVERLAY_GROUPS = [
  "airspaces",
  "airspaceLabels",
  "airports",
  "navaids",
  "reportingPoints",
] as const;

export type OpenAipOverlayGroup = (typeof OPENAIP_OVERLAY_GROUPS)[number];

export const OPENAIP_DEFAULT_ENABLED_GROUPS: OpenAipOverlayGroup[] = [
  "airspaces",
  "airspaceLabels",
  "airports",
];

export type OpenAipTheme = "light" | "dark";

export const OPENAIP_PATTERN_IMAGES = [
  "diagonal_lines_red-2",
  "diagonal_lines_red-3",
  "diagonal_lines_red-6",
  "diagonal_lines_green-2",
  "diagonal_lines_green-3",
  "diagonal_lines_green-6",
  "diagonal_lines_gray-2",
  "diagonal_lines_gray-3",
  "diagonal_lines_gray-6",
  "diagonal_lines_blue-2",
  "diagonal_lines_blue-3",
  "diagonal_lines_blue-6",
  "vertical_line_purple",
] as const;

export const OPENAIP_SYMBOL_IMAGE_IDS = [
  "ad_closed-small",
  "ad_closed-medium",
  "ad_mil-small",
  "ad_mil-medium",
  "apt-dot",
  "apt-tiny",
  "apt-medium",
  "apt-ring-tiny",
  "apt-ring-medium",
  "gliding-small",
  "gliding-medium",
  "gliding_winch-small",
  "gliding_winch-medium",
  "heli_civil-small",
  "heli_civil-medium",
  "heli_mil-small",
  "heli_mil-medium",
  "parachute-small",
  "parachute-large",
  "runway_paved-small",
  "runway_paved-medium",
  "runway_paved-large",
  "runway_unpaved-small",
  "runway_unpaved-medium",
  "runway_unpaved-large",
  "navaid_dme-small",
  "navaid_dme-medium",
  "navaid_ndb-small",
  "navaid_ndb-medium",
  "navaid_tacan-small",
  "navaid_tacan-medium",
  "navaid_vor-small",
  "navaid_vor-medium",
  "navaid_vor_dme-small",
  "navaid_vor_dme-medium",
  "navaid_vortac-small",
  "navaid_vortac-medium",
  "navaid_rose-medium",
  "reporting_point_compulsory-medium",
  "reporting_point_request-medium",
] as const;

const OPENAIP_SYMBOL_IMAGE_ID_SET = new Set<string>(OPENAIP_SYMBOL_IMAGE_IDS);

export const getOpenAipSymbolImageId = (imageId: string, theme: OpenAipTheme) => {
  return theme === "light" ? imageId : `dark:${imageId}`;
};

export const ensureOpenAipIcons = async (map: maplibregl.Map, theme: OpenAipTheme = "light") => {
  const loadedIcons = (map as any)._openAipIconsLoaded || new Set<string>();
  (map as any)._openAipIconsLoaded = loadedIcons;

  const promises: Promise<void>[] = [];

  for (const id of OPENAIP_PATTERN_IMAGES) {
    if (!loadedIcons.has(id) && !map.hasImage(id)) {
      promises.push((async () => {
        try {
          const res = await map.loadImage(`/openaip-style/patterns/${id}.svg`);
          if (res?.data && !map.hasImage(id)) {
            map.addImage(id, res.data as any);
            loadedIcons.add(id);
          }
        } catch (e) {
          console.warn(`Failed to load OpenAIP pattern ${id}`, e);
        }
      })());
    }
  }

  for (const id of OPENAIP_SYMBOL_IMAGE_IDS) {
    const symbolKey = theme === "dark" ? `dark:${id}` : id;
    if (!loadedIcons.has(symbolKey) && !map.hasImage(symbolKey)) {
      promises.push((async () => {
        try {
          if (theme === "dark" && typeof fetch !== "undefined") {
            const resp = await fetch(`/openaip-style/symbols/${id}.svg`);
            if (resp.ok) {
              const svgText = await resp.text();
              const darkSvg = svgText
                .replace(/#000000/gi, '#f8fafc')
                .replace(/#000/gi, '#f8fafc')
                .replace(/fill:\s*#000/gi, 'fill:#f8fafc')
                .replace(/stroke:\s*#000/gi, 'stroke:#f8fafc')
                .replace(/fill="black"/gi, 'fill="#f8fafc"')
                .replace(/stroke="black"/gi, 'stroke="#f8fafc"');
              const blob = new Blob([darkSvg], { type: 'image/svg+xml' });
              const blobUrl = URL.createObjectURL(blob);
              try {
                const res = await map.loadImage(blobUrl);
                if (res?.data && !map.hasImage(symbolKey)) {
                  map.addImage(symbolKey, res.data as any);
                  loadedIcons.add(symbolKey);
                }
              } finally {
                URL.revokeObjectURL(blobUrl);
              }
              return;
            }
          }

          const res = await map.loadImage(`/openaip-style/symbols/${id}.svg`);
          if (res?.data && !map.hasImage(symbolKey)) {
            map.addImage(symbolKey, res.data as any);
            loadedIcons.add(symbolKey);
          }
        } catch (e) {
          console.warn(`Failed to load OpenAIP symbol ${id}`, e);
        }
      })());
    }
  }

  await Promise.all(promises);
};

type OpenAipLayerBase = {
  group: OpenAipOverlayGroup;
  id: string;
  sourceLayer: string;
  filter?: maplibregl.ExpressionSpecification;
  minzoom?: number;
  maxzoom?: number;
};

type OpenAipFillLayer = OpenAipLayerBase & {
  kind: 'fill';
  layout?: maplibregl.FillLayerSpecification['layout'];
  paint: maplibregl.FillLayerSpecification['paint'];
};

type OpenAipLineLayer = OpenAipLayerBase & {
  kind: 'line';
  layout?: maplibregl.LineLayerSpecification['layout'];
  paint: maplibregl.LineLayerSpecification['paint'];
};

type OpenAipSymbolLayer = OpenAipLayerBase & {
  kind: 'symbol';
  layout?: maplibregl.SymbolLayerSpecification['layout'];
  paint: maplibregl.SymbolLayerSpecification['paint'];
};

export type OpenAipOverlayLayer =
  | OpenAipFillLayer
  | OpenAipLineLayer
  | OpenAipSymbolLayer;

const themeOpenAipIconImage = (
  iconImage: unknown,
  theme: OpenAipTheme,
): unknown => {
  if (theme === 'light') {
    return iconImage;
  }

  if (typeof iconImage === 'string') {
    return OPENAIP_SYMBOL_IMAGE_ID_SET.has(iconImage)
      ? getOpenAipSymbolImageId(iconImage, theme)
      : iconImage;
  }

  if (!Array.isArray(iconImage)) {
    return iconImage;
  }

  if (iconImage[0] === 'concat') {
    // If second element is a string literal (e.g. 'navaid_' or 'reporting_point_'),
    // prefix it with 'dark:' so the concatenated icon name resolves to e.g. 'dark:navaid_vor-small'
    if (typeof iconImage[1] === 'string') {
      return ['concat', `dark:${iconImage[1]}`, ...iconImage.slice(2)];
    }
    return ['concat', 'dark:', ...iconImage.slice(1)];
  }

  return iconImage.map((value) => themeOpenAipIconImage(value, theme));
};

const visibleLayout = { visibility: 'visible' } as const;

const textPaint = {
  'text-halo-color': 'rgb(211,226,255)',
  'text-halo-width': 8,
  'text-halo-blur': 0,
  'text-color': 'rgb(21,23,94)',
} satisfies maplibregl.SymbolLayerSpecification['paint'];

const pointTextPaint = {
  'text-halo-width': 2,
  'text-color': 'rgba(0, 0, 0, 1)',
  'text-halo-blur': 1,
  'text-halo-color': 'rgba(255, 255, 255, 1)',
} satisfies maplibregl.SymbolLayerSpecification['paint'];

const getAirportLabelPaint = (
  theme: OpenAipTheme,
): maplibregl.SymbolLayerSpecification['paint'] => ({
  'text-color':
    theme === 'dark' ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 0, 0, 1)',
  'text-halo-color':
    theme === 'dark' ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 255, 255, 1)',
  'text-halo-width': 2,
  'text-halo-blur': 1,
  'icon-opacity': 1,
  'text-opacity': 1,
});

const getDarkModeLabelPaintOverrides =
  (): maplibregl.SymbolLayerSpecification['paint'] => ({
    'text-color': 'rgba(255, 255, 255, 1)',
    'text-halo-color': 'rgba(0, 0, 0, 1)',
  });

const OPENAIP_DARK_MODE_INVERTED_LABEL_LAYER_IDS = new Set([
  'openaip-airport-gliding',
  'openaip-airport-gliding-winch',
  'openaip-navaid',
  'openaip-navaid-other',
  'openaip-navaid-ndb',
  'openaip-reporting-point',
  'openaip-airspace-label-minimal',
  'openaip-airspace-label-medium',
  'openaip-airspace-label-full',
]);

const OPENAIP_AIRPORT_LABEL_LAYER_IDS = new Set([
  'openaip-airport-intl',
  'openaip-airport-generic',
]);

const byTypes = (types: string[]): maplibregl.ExpressionSpecification => [
  'match',
  ['get', 'type'],
  types,
  true,
  false,
];

const otherClasses = (
  classes: string[],
): maplibregl.ExpressionSpecification => [
  'all',
  ['==', ['get', 'type'], 'other'],
  ['match', ['get', 'icao_class'], classes, true, false],
];

const zoomOpacity = (
  z0: number,
  o0: number,
  z1: number,
  o1: number,
): maplibregl.ExpressionSpecification => [
  'interpolate',
  ['linear'],
  ['zoom'],
  z0,
  o0,
  z1,
  o1,
];

const zoomWidth = (
  ...stops: Array<number>
): maplibregl.ExpressionSpecification => [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...stops,
];

const patternFor = (
  color: 'red' | 'green' | 'gray' | 'blue',
): maplibregl.ExpressionSpecification => [
  'step',
  ['zoom'],
  `diagonal_lines_${color}-2`,
  8,
  `diagonal_lines_${color}-3`,
  10,
  `diagonal_lines_${color}-6`,
];

type ZoomStepValue = string | number | maplibregl.ExpressionSpecification;

const zoomStep = (
  initialValue: ZoomStepValue,
  ...stops: Array<number | ZoomStepValue>
): maplibregl.ExpressionSpecification => [
  'step',
  ['zoom'],
  initialValue,
  ...stops,
];

const runwayImageForSurface = (
  suffix: 'small' | 'medium' | 'large',
): maplibregl.ExpressionSpecification => [
  'case',
  ['==', ['get', 'runway_surface'], 'unpaved'],
  `runway_unpaved-${suffix}`,
  `runway_paved-${suffix}`,
];

const runwayImageBySurface = (): maplibregl.ExpressionSpecification =>
  zoomStep(
    runwayImageForSurface('small'),
    12,
    runwayImageForSurface('medium'),
    17,
    runwayImageForSurface('large'),
  );

const largeRunwayImageBySurface = (): maplibregl.ExpressionSpecification =>
  runwayImageForSurface('large');

const genericAirportSmallIconByType =
  (): maplibregl.ExpressionSpecification => [
    'match',
    ['get', 'type'],
    'heli_civil',
    'heli_civil-small',
    'heli_mil',
    'heli_mil-small',
    'ad_closed',
    'ad_closed-small',
    'ad_mil',
    'ad_mil-small',
    'apt_mil_civil',
    'ad_mil-small',
    'apt-ring-tiny',
  ];

const genericAirportMediumIconByType =
  (): maplibregl.ExpressionSpecification => [
    'match',
    ['get', 'type'],
    'heli_civil',
    'heli_civil-medium',
    'heli_mil',
    'heli_mil-medium',
    'ad_closed',
    'ad_closed-medium',
    'ad_mil',
    'ad_mil-medium',
    'apt_mil_civil',
    'ad_mil-medium',
    ['case', ['has', 'icao_code'], 'apt-medium', 'apt-ring-medium'],
  ];

const genericAirportIconByType = (): maplibregl.ExpressionSpecification =>
  zoomStep(
    genericAirportSmallIconByType(),
    9,
    genericAirportMediumIconByType(),
  );

const fill = (
  group: OpenAipOverlayGroup,
  id: string,
  sourceLayer: string,
  paint: maplibregl.FillLayerSpecification['paint'],
  options: Omit<
    OpenAipFillLayer,
    'kind' | 'group' | 'id' | 'sourceLayer' | 'paint'
  > = {},
): OpenAipFillLayer => ({
  kind: 'fill',
  group,
  id,
  sourceLayer,
  ...options,
  paint,
});

const line = (
  group: OpenAipOverlayGroup,
  id: string,
  sourceLayer: string,
  paint: maplibregl.LineLayerSpecification['paint'],
  options: Omit<
    OpenAipLineLayer,
    'kind' | 'group' | 'id' | 'sourceLayer' | 'paint'
  > = {},
): OpenAipLineLayer => ({
  kind: 'line',
  group,
  id,
  sourceLayer,
  ...options,
  paint,
});

const symbol = (
  group: OpenAipOverlayGroup,
  id: string,
  sourceLayer: string,
  layout: maplibregl.SymbolLayerSpecification['layout'],
  paint: maplibregl.SymbolLayerSpecification['paint'],
  options: Omit<
    OpenAipSymbolLayer,
    'kind' | 'group' | 'id' | 'sourceLayer' | 'layout' | 'paint'
  > = {},
): OpenAipSymbolLayer => ({
  kind: 'symbol',
  group,
  id,
  sourceLayer,
  ...options,
  layout,
  paint,
});

const OPENAIP_ALL_LAYERS: OpenAipOverlayLayer[] = [
  fill(
    'airspaces',
    'openaip-airspace-tra-tsa-pattern',
    'airspaces_border_offset',
    {
      'fill-color': 'rgba(154, 14, 14, 1)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.3),
      'fill-outline-color': 'rgba(154, 14, 14, 0)',
      'fill-pattern': patternFor('red'),
    },
    {
      minzoom: 3,
      filter: byTypes(['tra', 'tsa', 'tfa']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-rdp-pattern',
    'airspaces_border_offset',
    {
      'fill-color': 'rgba(154, 14, 14, 1)',
      'fill-opacity': zoomOpacity(3, 0, 7, 1),
      'fill-outline-color': 'rgba(154, 14, 14, 0)',
      'fill-pattern': patternFor('red'),
    },
    {
      minzoom: 3,
      filter: byTypes(['restricted', 'danger', 'prohibited']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-cd-pattern',
    'airspaces_border_offset_2x',
    {
      'fill-opacity': zoomOpacity(3, 0, 7, 1),
      'fill-outline-color': 'rgba(154, 14, 14, 0)',
      'fill-pattern': patternFor('green'),
    },
    {
      minzoom: 3,
      filter: otherClasses(['c', 'd']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-ab-fill',
    'airspaces_border_offset_2x',
    {
      'fill-color': 'rgba(51, 158, 47, 0.5)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.2),
      'fill-outline-color': 'rgba(118, 145, 195, 0)',
    },
    {
      minzoom: 3,
      filter: otherClasses(['a', 'b']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-f-fill',
    'airspaces_border_offset_2x',
    {
      'fill-color': 'rgba(118, 145, 195, 1)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.5),
      'fill-outline-color': 'rgba(118, 145, 195, 0)',
    },
    {
      minzoom: 3,
      filter: otherClasses(['f']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-g-fill',
    'airspaces_border_offset_2x',
    {
      'fill-color': 'rgba(118, 145, 195, 0.2)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.5),
      'fill-outline-color': 'rgba(118, 145, 195, 0)',
    },
    {
      minzoom: 3,
      filter: otherClasses(['g']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-ctr-fill',
    'airspaces',
    {
      'fill-color': 'rgba(218, 111, 134, 1)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.2),
    },
    {
      minzoom: 3,
      filter: byTypes(['ctr']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-rmz-fill',
    'airspaces',
    {
      'fill-color': 'rgba(101, 134, 175, 1)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.1),
    },
    {
      minzoom: 3,
      filter: byTypes(['rmz', 'tiz', 'tia']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-tma-cta-fill',
    'airspaces_border_offset',
    {
      'fill-color': 'rgba(218, 111, 134, 1)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.2),
      'fill-outline-color': 'rgba(218, 111, 134, 0)',
    },
    {
      minzoom: 3,
      filter: byTypes(['tma', 'cta']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-awy-pattern',
    'airspaces_border_offset',
    {
      'fill-color': 'rgba(87, 87, 87, 1)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.2),
      'fill-outline-color': 'rgba(87, 87, 87, 0)',
      'fill-pattern': patternFor('gray'),
    },
    {
      minzoom: 3,
      filter: byTypes(['awy']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-awy-fill',
    'airspaces',
    {
      'fill-color': 'rgba(206, 206, 206, 1)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.1),
    },
    {
      minzoom: 3,
      filter: byTypes(['awy']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-moa-fill',
    'airspaces',
    {
      'fill-color': 'rgb(255,146,0)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.05),
      'fill-outline-color': 'rgb(255,146,0)',
    },
    {
      minzoom: 3,
      filter: byTypes(['mtr', 'mta', 'mrt']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-traffic-pattern',
    'airspaces_border_offset',
    {
      'fill-color': 'rgba(21, 77, 154, 1)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.3),
      'fill-outline-color': 'rgba(21, 77, 154, 0)',
      'fill-pattern': patternFor('blue'),
    },
    {
      minzoom: 3,
      filter: byTypes(['matz', 'atz', 'htz']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-alwapro-fill',
    'airspaces',
    {
      'fill-color': 'rgb(147,53,201)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.1),
      'fill-outline-color': 'rgb(21, 77, 154)',
    },
    {
      minzoom: 3,
      filter: byTypes(['alert', 'warning', 'protected']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-adiz-fill',
    'airspaces_border_offset_2x',
    {
      'fill-color': 'rgba(122, 0, 150, 1)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.2),
      'fill-outline-color': 'rgba(142, 0, 181, 0)',
    },
    {
      minzoom: 3,
      filter: byTypes(['adiz']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-gliding-fill',
    'airspaces',
    {
      'fill-color': 'rgba(255, 215, 0, 0.8)',
      'fill-opacity': zoomOpacity(3, 0, 7, 0.1),
      'fill-outline-color': 'rgba(255, 215, 0, 0)',
    },
    {
      minzoom: 3,
      filter: byTypes(['gliding_sector', 'vfr_sector']),
    },
  ),
  fill(
    'airspaces',
    'openaip-airspace-sport-pattern',
    'airspaces_border_offset',
    {
      'fill-color': 'rgb(0,139,175)',
      'fill-opacity': zoomOpacity(3, 0, 7, 1),
      'fill-outline-color': 'rgba(154, 14, 14, 0)',
      'fill-pattern': patternFor('blue'),
    },
    {
      minzoom: 3,
      filter: byTypes(['aerial_sporting_recreational']),
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-tfr-border',
    'airspaces',
    {
      'line-color': 'rgba(154,14,14,0.5)',
      'line-width': zoomWidth(3, 0.2, 10, 1),
      'line-opacity': zoomOpacity(3, 0, 7, 0.1),
    },
    {
      minzoom: 3,
      filter: byTypes(['tfr']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-tsa-border',
    'airspaces',
    {
      'line-color': 'rgba(154, 14, 14, 1)',
      'line-width': zoomWidth(3, 0.1, 10, 2),
      'line-opacity': zoomOpacity(3, 0, 7, 0.3),
    },
    {
      minzoom: 3,
      filter: byTypes(['tsa']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-tra-border',
    'airspaces',
    {
      'line-color': 'rgba(154, 14, 14, 1)',
      'line-width': zoomWidth(3, 0.1, 10, 2),
      'line-opacity': zoomOpacity(3, 0, 7, 0.3),
      'line-dasharray': [
        'step',
        ['zoom'],
        ['literal', [3, 1]],
        3,
        ['literal', [5, 2]],
        12,
        ['literal', [12, 4]],
      ],
    },
    {
      minzoom: 3,
      filter: byTypes(['tra']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-rdp-border',
    'airspaces',
    {
      'line-color': 'rgba(154, 14, 14, 1)',
      'line-width': zoomWidth(3, 0.1, 10, 2),
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: byTypes(['restricted', 'danger', 'prohibited']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-cd-border',
    'airspaces',
    {
      'line-color': 'rgba(51, 158, 47, 1)',
      'line-width': zoomWidth(3, 0.1, 10, 2),
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: otherClasses(['c', 'd']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-ab-border',
    'airspaces',
    {
      'line-color': 'rgba(51, 158, 47, 1)',
      'line-width': zoomWidth(3, 0.1, 10, 2),
      'line-dasharray': ['literal', [5, 5]],
      'line-opacity': zoomOpacity(3, 0, 7, 0.5),
    },
    {
      minzoom: 3,
      filter: otherClasses(['a', 'b']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-e-border',
    'airspaces',
    {
      'line-color': 'rgba(21, 77, 154, 1)',
      'line-width': zoomWidth(3, 0.1, 10, 2),
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: otherClasses(['e']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-f-border',
    'airspaces',
    {
      'line-color': 'rgba(21, 77, 154, 1)',
      'line-width': zoomWidth(3, 0.2, 10, 4),
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: otherClasses(['f']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-g-border',
    'airspaces',
    {
      'line-color': 'rgba(21, 77, 154, 0.5)',
      'line-width': zoomWidth(3, 0.1, 10, 2),
      'line-dasharray': ['literal', [5, 5]],
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: otherClasses(['g']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-ctr-border',
    'airspaces',
    {
      'line-color': 'rgba(21, 77, 154, 1)',
      'line-width': zoomWidth(8, 1, 12, 3),
      'line-dasharray': [
        'step',
        ['zoom'],
        ['literal', [3, 1]],
        3,
        ['literal', [5, 2]],
        12,
        ['literal', [12, 4]],
      ],
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: byTypes(['ctr']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-tmz-border',
    'airspaces',
    {
      'line-color': 'rgba(21, 77, 154, 1)',
      'line-width': zoomWidth(3, 0.1, 8, 2, 10, 4, 14, 10),
      'line-dasharray': [
        'step',
        ['zoom'],
        ['literal', [5, 5]],
        10,
        ['literal', [10, 10]],
      ],
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: byTypes(['tmz']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-tmz-border-dot',
    'airspaces',
    {
      'line-color': 'rgba(21, 77, 154, 1)',
      'line-width': zoomWidth(3, 0.1, 8, 2, 10, 4, 14, 10),
      'line-dasharray': [
        'step',
        ['zoom'],
        ['literal', [1.25, 2.5]],
        10,
        ['literal', [2, 5]],
      ],
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: byTypes(['tmz']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-rmz-border',
    'airspaces',
    {
      'line-color': 'rgba(21, 77, 154, 1)',
      'line-width': zoomWidth(3, 0.1, 14, 2),
      'line-dasharray': ['literal', [1, 1]],
      'line-opacity': zoomOpacity(3, 0, 7, 0.5),
    },
    {
      minzoom: 3,
      filter: byTypes(['rmz', 'tiz', 'tia']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-trp-border',
    'airspaces',
    {
      'line-color': 'rgba(21, 77, 154, 1)',
      'line-width': zoomWidth(3, 0.1, 8, 2, 10, 4, 14, 10),
      'line-dasharray': [
        'step',
        ['zoom'],
        ['literal', [1, 1]],
        10,
        ['literal', [2, 2]],
      ],
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: byTypes(['trp']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-tma-cta-border',
    'airspaces',
    {
      'line-color': 'rgba(21, 77, 154, 1)',
      'line-width': zoomWidth(3, 0.1, 10, 2),
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: byTypes(['tma', 'cta']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-fir-border',
    'airspaces',
    {
      'line-color': 'rgba(110, 201, 32, 0.4)',
      'line-width': zoomWidth(8, 2, 10, 4, 11, 6),
      'line-opacity': 0.8,
      'line-dasharray': [
        'step',
        ['zoom'],
        ['literal', [5, 2.5]],
        12,
        ['literal', [10, 5]],
      ],
    },
    {
      minzoom: 3,
      filter: byTypes(['fir', 'acc_sector', 'fis_sector']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-uir-border',
    'airspaces',
    {
      'line-color': 'rgba(91, 156, 38, 0.4)',
      'line-width': zoomWidth(8, 2, 10, 4, 11, 6),
      'line-opacity': 0.8,
      'line-dasharray': [
        'step',
        ['zoom'],
        ['literal', [5, 2.5]],
        12,
        ['literal', [10, 5]],
      ],
    },
    {
      minzoom: 3,
      filter: byTypes(['uir']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-awy-border',
    'airspaces',
    {
      'line-color': 'rgba(87, 87, 87, 1)',
      'line-width': zoomWidth(3, 0.1, 10, 0.5),
      'line-opacity': zoomOpacity(3, 0, 7, 0.2),
    },
    {
      minzoom: 3,
      filter: byTypes(['awy']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-moa-border',
    'airspaces',
    {
      'line-color': 'rgba(255,146,0, 1)',
      'line-width': zoomWidth(3, 0.3, 10, 2),
      'line-opacity': zoomOpacity(3, 0, 7, 0.6),
      'line-dasharray': ['literal', [2, 2]],
    },
    {
      minzoom: 3,
      filter: byTypes(['mtr', 'mta', 'mrt']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-traffic-border',
    'airspaces',
    {
      'line-color': 'rgba(21, 77, 154, 1)',
      'line-width': zoomWidth(3, 0.1, 10, 0.5),
      'line-opacity': zoomOpacity(3, 0, 7, 0.3),
    },
    {
      minzoom: 3,
      filter: byTypes(['matz', 'atz', 'htz']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-alwapro-border',
    'airspaces',
    {
      'line-color': 'rgb(147,53,201)',
      'line-width': zoomWidth(3, 0.1, 10, 2),
      'line-opacity': zoomOpacity(3, 0, 7, 0.4),
      'line-dasharray': [
        'step',
        ['zoom'],
        ['literal', [3, 1]],
        3,
        ['literal', [5, 2]],
        12,
        ['literal', [12, 4]],
      ],
    },
    {
      minzoom: 3,
      filter: byTypes(['alert', 'warning', 'protected']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-adiz-border',
    'airspaces',
    {
      'line-color': 'rgba(86, 0, 150, 1)',
      'line-width': zoomWidth(3, 2, 10, 4),
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: byTypes(['adiz']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-gliding-border',
    'airspaces',
    {
      'line-color': 'rgba(255, 215, 0, 1)',
      'line-width': 1,
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: byTypes(['gliding_sector', 'vfr_sector', 'lta', 'uta']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-sport-border',
    'airspaces',
    {
      'line-color': 'rgb(0,139,175)',
      'line-width': zoomWidth(3, 0.1, 10, 2),
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: byTypes(['aerial_sporting_recreational']),
      layout: visibleLayout,
    },
  ),
  line(
    'airspaces',
    'openaip-airspace-overflight-border',
    'airspaces',
    {
      'line-color': 'rgb(119,21,154)',
      'line-width': zoomWidth(3, 0.05, 10, 3),
      'line-opacity': zoomOpacity(3, 0, 7, 1),
    },
    {
      minzoom: 3,
      filter: byTypes(['overflight_restriction']),
      layout: visibleLayout,
    },
  ),
  symbol(
    'airspaces',
    'openaip-airspace-overflight-symbol',
    'airspaces',
    {
      visibility: 'visible',
      'icon-image': 'vertical_line_purple',
      'icon-allow-overlap': true,
      'icon-anchor': 'top',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 7, 0.05, 18, 0.4],
      'symbol-spacing': 30,
      'symbol-avoid-edges': true,
      'symbol-placement': 'line',
    },
    {
      'icon-opacity': 1,
    },
    {
      minzoom: 3,
      filter: byTypes(['overflight_restriction']),
    },
  ),
  symbol(
    'airspaceLabels',
    'openaip-airspace-label-minimal',
    'airspaces',
    {
      visibility: 'visible',
      'symbol-placement': 'line',
      'text-field': [
        'format',
        [
          'case',
          ['!=', ['get', 'icao_class'], 'unclassified'],
          ['upcase', ['get', 'icao_class']],
          ['upcase', ['get', 'type']],
        ],
      ],
      'symbol-spacing': 150,
      'text-optional': true,
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 7, 8, 9],
      'text-font': ['Roboto Medium'],
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'symbol-avoid-edges': true,
      'text-anchor': 'center',
      'text-offset': [0, 0.8],
      'text-justify': 'center',
    },
    textPaint,
    {
      minzoom: 5,
      maxzoom: 8,
    },
  ),
  symbol(
    'airspaceLabels',
    'openaip-airspace-label-medium',
    'airspaces',
    {
      visibility: 'visible',
      'symbol-placement': 'line',
      'text-field': ['coalesce', ['get', 'name_label'], ['get', 'name']],
      'symbol-spacing': 550,
      'text-optional': true,
      'text-size': ['interpolate', ['linear'], ['zoom'], 9, 9, 10, 12],
      'text-font': ['Roboto Regular'],
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'symbol-avoid-edges': true,
      'text-anchor': 'center',
      'text-offset': [0, 1],
      'text-justify': 'center',
    },
    textPaint,
    {
      minzoom: 8,
      maxzoom: 10,
    },
  ),
  symbol(
    'airspaceLabels',
    'openaip-airspace-label-full',
    'airspaces',
    {
      visibility: 'visible',
      'symbol-placement': 'line',
      'text-field': [
        'format',
        [
          'case',
          ['!=', ['get', 'icao_class'], 'unclassified'],
          ['upcase', ['get', 'icao_class']],
          '',
        ],
        '\n',
        ['get', 'name'],
        '\n',
        [
          'case',
          [
            'all',
            ['==', ['get', 'upper_limit_reference_datum'], 'GND'],
            ['==', ['get', 'upper_limit_value'], 0],
          ],
          'GND',
          [
            'case',
            ['==', ['get', 'upper_limit_reference_datum'], 'STD'],
            ['concat', 'FL', ['to-string', ['get', 'upper_limit_value']]],
            [
              'concat',
              ['to-string', ['get', 'upper_limit_value']],
              ' ',
              ['get', 'upper_limit_unit'],
              ' ',
              ['get', 'upper_limit_reference_datum'],
            ],
          ],
        ],
        '\n────\n',
        [
          'case',
          [
            'all',
            ['==', ['get', 'lower_limit_reference_datum'], 'GND'],
            ['==', ['get', 'lower_limit_value'], 0],
          ],
          'GND',
          [
            'case',
            ['==', ['get', 'lower_limit_reference_datum'], 'STD'],
            ['concat', 'FL', ['to-string', ['get', 'lower_limit_value']]],
            [
              'concat',
              ['to-string', ['get', 'lower_limit_value']],
              ' ',
              ['get', 'lower_limit_unit'],
              ' ',
              ['get', 'lower_limit_reference_datum'],
            ],
          ],
        ],
      ],
      'symbol-spacing': 600,
      'text-optional': true,
      'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 11, 12],
      'text-font': ['Roboto Regular'],
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'symbol-avoid-edges': true,
      'text-anchor': 'center',
      'text-offset': [0, 3.5],
      'text-justify': 'center',
    },
    textPaint,
    {
      minzoom: 10,
    },
  ),
  symbol(
    'airports',
    'openaip-airport-runway-large',
    'airports',
    {
      visibility: 'visible',
      'icon-image': largeRunwayImageBySurface(),
      'icon-allow-overlap': true,
      'icon-rotate': ['coalesce', ['get', 'runway_rotation'], 0],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-padding': 0,
    },
    {
      'icon-opacity': 1,
    },
    {
      minzoom: 10,
      filter: [
        'all',
        ['!=', ['get', 'type'], 'ad_closed'],
        ['!=', ['get', 'type'], 'af_water'],
        ['!=', ['get', 'type'], 'heli_civil'],
        ['!=', ['get', 'type'], 'heli_mil'],
        ['match', ['get', 'runway_surface'], ['paved', 'unpaved'], true, false],
        ['==', ['get', 'type'], 'intl_apt'],
      ],
    },
  ),
  symbol(
    'airports',
    'openaip-airport-runway',
    'airports',
    {
      visibility: 'visible',
      'icon-image': runwayImageBySurface(),
      'icon-allow-overlap': true,
      'icon-rotate': ['coalesce', ['get', 'runway_rotation'], 0],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-padding': 0,
    },
    {
      'icon-opacity': 1,
    },
    {
      minzoom: 11,
      filter: [
        'all',
        ['!=', ['get', 'type'], 'ad_closed'],
        ['!=', ['get', 'type'], 'af_water'],
        ['!=', ['get', 'type'], 'heli_civil'],
        ['!=', ['get', 'type'], 'heli_mil'],
        ['!=', ['get', 'type'], 'gliding'],
        ['match', ['get', 'runway_surface'], ['paved', 'unpaved'], true, false],
        ['!=', ['get', 'type'], 'intl_apt'],
      ],
    },
  ),
  symbol(
    'airports',
    'openaip-airport-runway-gliding',
    'airports',
    {
      visibility: 'visible',
      'icon-image': runwayImageBySurface(),
      'icon-allow-overlap': true,
      'icon-rotate': ['coalesce', ['get', 'runway_rotation'], 0],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-padding': 0,
    },
    {
      'icon-opacity': 1,
    },
    {
      minzoom: 12,
      filter: [
        'all',
        ['==', ['get', 'type'], 'gliding'],
        ['match', ['get', 'runway_surface'], ['paved', 'unpaved'], true, false],
      ],
    },
  ),
  symbol(
    'airports',
    'openaip-airport-parachute',
    'airports',
    {
      visibility: 'visible',
      'icon-image': zoomStep('parachute-small', 10, 'parachute-large'),
      'icon-size': 1,
      'icon-allow-overlap': false,
      'icon-offset': zoomStep(
        ['literal', [-20, 15]],
        10,
        ['literal', [-30, 20]],
        17,
        ['literal', [-40, 25]],
      ),
      'icon-pitch-alignment': 'map',
    },
    {
      'icon-opacity': 1,
    },
    {
      minzoom: 8,
      filter: ['==', ['get', 'skydive_activity'], true],
    },
  ),
  symbol(
    'airports',
    'openaip-airport-gliding',
    'airports',
    {
      visibility: 'visible',
      'icon-image': zoomStep('gliding-small', 12, 'gliding-medium'),
      'icon-pitch-alignment': 'map',
      'icon-size': 1,
      'icon-allow-overlap': true,
      'symbol-placement': 'point',
      'text-field': zoomStep(
        ['coalesce', ['get', 'name_label'], ['get', 'name']],
        10,
        ['coalesce', ['get', 'name_label_full'], ['get', 'name']],
      ),
      'text-size': zoomStep(9, 12, 12),
      'text-offset': zoomStep(['literal', [0, -3.5]], 10, ['literal', [0, -4]]),
      'text-optional': true,
      'text-ignore-placement': true,
    },
    {
      ...pointTextPaint,
      'icon-opacity': zoomOpacity(8, 0, 10, 1),
      'text-opacity': zoomOpacity(8, 0, 10, 1),
    },
    {
      minzoom: 8,
      filter: [
        'all',
        ['==', ['get', 'type'], 'gliding'],
        ['==', ['get', 'winch_only'], false],
      ],
    },
  ),
  symbol(
    'airports',
    'openaip-airport-gliding-winch',
    'airports',
    {
      visibility: 'visible',
      'icon-image': zoomStep('gliding_winch-small', 12, 'gliding_winch-medium'),
      'icon-pitch-alignment': 'map',
      'icon-size': 1,
      'icon-allow-overlap': true,
      'symbol-placement': 'point',
      'text-field': zoomStep(
        ['coalesce', ['get', 'name_label'], ['get', 'name']],
        10,
        ['coalesce', ['get', 'name_label_full'], ['get', 'name']],
      ),
      'text-size': zoomStep(9, 12, 12),
      'text-offset': zoomStep(['literal', [0, -2.5]], 10, ['literal', [0, -4]]),
      'text-optional': true,
      'text-ignore-placement': true,
    },
    {
      ...pointTextPaint,
      'icon-opacity': zoomOpacity(8, 0, 10, 1),
      'text-opacity': zoomOpacity(8, 0, 10, 1),
    },
    {
      minzoom: 8,
      filter: [
        'all',
        ['==', ['get', 'type'], 'gliding'],
        ['==', ['get', 'winch_only'], true],
      ],
    },
  ),
  symbol(
    'airports',
    'openaip-airport-intl',
    'airports',
    {
      visibility: 'visible',
      'icon-image': zoomStep('apt-dot', 8, 'apt-medium'),
      'icon-size': zoomStep(0.35, 6, 0.45, 8, 0.85, 11, 1),
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-field': zoomStep(
        '',
        8,
        ['coalesce', ['get', 'name'], ['get', 'name_label_full'], ['get', 'name_label'], ['get', 'icao_code']],
      ),
      'text-justify': 'center',
      'text-anchor': 'top',
      'text-offset': ['literal', [0, 0.8]],
      'text-size': zoomStep(10, 8, 11, 11, 12.5),
      'text-font': ['Noto Sans Regular'],
      'text-transform': 'none',
      'text-optional': true,
      'icon-ignore-placement': false,
      'icon-optional': false,
    },
    getAirportLabelPaint('light'),
    {
      minzoom: 3,
      filter: ['==', ['get', 'type'], 'intl_apt'],
    },
  ),
  symbol(
    'airports',
    'openaip-airport-generic',
    'airports',
    {
      visibility: 'visible',
      'icon-image': zoomStep('apt-dot', 8.5, genericAirportMediumIconByType()),
      'icon-size': zoomStep(0.28, 6, 0.38, 8.5, 0.75, 11, 0.9),
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-field': zoomStep(
        '',
        8.5,
        ['coalesce', ['get', 'name'], ['get', 'name_label_full'], ['get', 'name_label'], ['get', 'icao_code']],
      ),
      'text-justify': 'center',
      'text-anchor': 'top',
      'text-offset': ['literal', [0, 0.8]],
      'text-size': zoomStep(9.5, 9, 10.5, 11, 11.5),
      'text-font': ['Noto Sans Regular'],
      'text-transform': 'none',
      'text-optional': true,
      'icon-ignore-placement': false,
    },
    getAirportLabelPaint('light'),
    {
      minzoom: 4,
      filter: [
        'all',
        ['!=', ['get', 'type'], 'intl_apt'],
        ['!=', ['get', 'type'], 'gliding'],
      ],
    },
  ),
  symbol(
    'navaids',
    'openaip-navaid-other',
    'navaids',
    {
      visibility: 'visible',
      'icon-image': zoomStep(
        ['concat', 'navaid_', ['get', 'type'], '-small'],
        8,
        ['concat', 'navaid_', ['get', 'type'], '-medium'],
      ),
      'icon-size': zoomStep(0.45, 6, 0.7, 8, 1),
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'text-field': zoomStep(['get', 'identifier'], 7, [
        'coalesce',
        ['get', 'name_label_full'],
        ['get', 'name'],
      ]),
      'text-allow-overlap': true,
      'text-offset': zoomStep(
        ['literal', [0, 1.2]],
        8,
        ['literal', [0, 1.8]],
        10,
        ['literal', [0, 2.5]],
      ),
      'text-size': zoomStep(9, 6, 10, 8, 12),
      'text-font': ['Roboto Regular'],
      'icon-ignore-placement': false,
      'text-ignore-placement': true,
    },
    pointTextPaint,
    {
      minzoom: 4,
      filter: [
        'all',
        ['!=', ['get', 'type'], 'ndb'],
        [
          'match',
          ['get', 'type'],
          ['dme', 'tacan', 'vor', 'vor_dme', 'vortac'],
          true,
          false,
        ],
      ],
    },
  ),
  symbol(
    'navaids',
    'openaip-navaid-ndb',
    'navaids',
    {
      visibility: 'visible',
      'icon-image': zoomStep('navaid_ndb-small', 10, 'navaid_ndb-medium'),
      'icon-size': zoomStep(0.45, 6, 0.7, 8, 1),
      'icon-pitch-alignment': 'map',
      'symbol-placement': 'point',
      'text-field': zoomStep(['get', 'identifier'], 7, [
        'coalesce',
        ['get', 'name_label_full'],
        ['get', 'name'],
      ]),
      'text-size': zoomStep(9, 6, 10, 8, 12),
      'text-font': ['Roboto Regular'],
      'text-justify': 'left',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'icon-allow-overlap': true,
      'icon-ignore-placement': false,
      'icon-optional': false,
    },
    {
      'icon-opacity': zoomOpacity(4, 0.6, 7, 1),
      'text-color': 'rgba(0, 0, 0, 1)',
      'text-halo-color': 'rgba(255, 255, 255, 1)',
      'text-halo-width': 1,
      'text-translate-anchor': 'map',
      'text-translate': zoomStep(
        ['literal', [0, -20]],
        9,
        ['literal', [0, -25]],
        10,
        ['literal', [0, -35]],
      ),
    },
    {
      minzoom: 4,
      filter: ['==', ['get', 'type'], 'ndb'],
    },
  ),
  symbol(
    'navaids',
    'openaip-navaid-rose',
    'navaids',
    {
      visibility: 'visible',
      'icon-image': 'navaid_rose-medium',
      'icon-size': zoomStep(0.5, 7, 0.8, 10, 1),
      'icon-allow-overlap': true,
      'icon-rotate': ['coalesce', ['get', 'icon_rotation'], 0],
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'icon-ignore-placement': true,
      'icon-optional': false,
    },
    {
      'icon-opacity': zoomOpacity(5, 0.35, 7, 0.95),
    },
    {
      minzoom: 5,
      filter: [
        'match',
        ['get', 'type'],
        ['vor', 'vor_dme', 'vortac'],
        true,
        false,
      ],
    },
  ),
  symbol(
    'reportingPoints',
    'openaip-reporting-point',
    'reporting_points',
    {
      visibility: 'visible',
      'icon-image': ['concat', 'reporting_point_', ['get', 'type'], '-medium'],
      'icon-size': zoomStep(0.65, 8, 1),
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'text-field': ['get', 'name'],
      'text-allow-overlap': true,
      'text-offset': ['literal', [0, 2]],
      'text-size': zoomStep(9, 8, 11),
      'text-font': ['Roboto Regular'],
      'icon-ignore-placement': false,
      'text-ignore-placement': true,
    },
    pointTextPaint,
    {
      minzoom: 7,
    },
  ),
];


export const getOpenAipOverlayLayers = (
  enabledGroups: OpenAipOverlayGroup[] = OPENAIP_DEFAULT_ENABLED_GROUPS,
  theme: OpenAipTheme = "light"
): any[] => {
  const effectiveGroups = new Set<string>(enabledGroups);
  if (effectiveGroups.has("airspaces")) {
    effectiveGroups.add("airspaceLabels");
  }

  return OPENAIP_ALL_LAYERS.filter((layer) => {
    if (layer.group === "navaids" || layer.group === "reportingPoints") {
      return false;
    }
    return effectiveGroups.has(layer.group);
  }).map((layer) => {
    let layout = layer.layout ? { ...layer.layout } : undefined;
    if (layout?.["text-font"]) {
      layout["text-font"] = ["Noto Sans Regular"];
    }

    if (layer.kind !== "symbol") {
      return {
        id: layer.id,
        type: layer.kind,
        source: OPENAIP_AIRSPACE_SOURCE_ID,
        "source-layer": layer.sourceLayer,
        filter: layer.filter,
        minzoom: layer.minzoom,
        maxzoom: layer.maxzoom,
        paint: layer.paint,
        layout,
      };
    }

    const themedIconImage = layout?.["icon-image"]
      ? themeOpenAipIconImage(layout["icon-image"], theme)
      : undefined;

    if (themedIconImage && layout) {
      layout["icon-image"] = themedIconImage;
    }

    let paint = layer.paint;
    if (theme === "dark" && OPENAIP_DARK_MODE_INVERTED_LABEL_LAYER_IDS.has(layer.id)) {
      paint = { ...paint, ...getDarkModeLabelPaintOverrides() };
    }
    if (OPENAIP_AIRPORT_LABEL_LAYER_IDS.has(layer.id)) {
      paint = getAirportLabelPaint(theme);
    }

    return {
      id: layer.id,
      type: layer.kind,
      source: OPENAIP_AIRSPACE_SOURCE_ID,
      "source-layer": layer.sourceLayer,
      filter: layer.filter,
      minzoom: layer.minzoom,
      maxzoom: layer.maxzoom,
      paint,
      layout,
    };
  });
};
