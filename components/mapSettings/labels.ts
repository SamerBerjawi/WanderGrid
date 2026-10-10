/**
 * All user-facing strings for the Map Settings ("Mission Control") panel.
 * Centralized in one file for easy editing and zero copy duplication.
 */
export const MAP_SETTINGS_LABELS = {
  // Panel title
  panelTitle: 'Map settings',

  // Tabs (Fixed order: Map, Layers, Trips, Filter)
  tabs: {
    map: 'Map',
    layers: 'Layers',
    trips: 'Trips',
    filter: 'Filter',
  },

  // Map Tab
  mapTab: {
    view: 'View',
    globe: 'Globe',
    flat: 'Flat',
    starsAndAtmosphere: 'Stars & atmosphere',
    starsAtmosphereHelper: 'Globe view only',
    dayNightShading: 'Day & night shading',
    basemap: 'Basemap',
    basemapGroups: {
      auto: 'Auto',
      streets: 'Light',
      dark: 'Dark',
      imagery: 'Imagery',
      special: 'Special',
    },
    basemaps: {
      default: 'Auto (theme)',
      liberty: 'Streets',
      bright: 'Bright',
      positron: 'Positron',
      dark: 'Dark',
      fiord: 'Dark blue',
      satellite: 'Satellite',
      citylights: 'Night lights',
      threeD: '3D buildings',
      ocean: 'Ocean',
    },
    oceanDarkOnlyHelper: 'Dark theme only',
  },

  // Layers Tab
  layersTab: {
    rainRadar: 'Rain radar',
    opacity: 'Opacity',
    reliefShading: 'Mountain projection',
    strength: 'Strength',
    terrain3d: '3D elevation',
    heightExaggeration: 'Height exaggeration',
    railLines: 'Rail lines',
    aviationCharts: 'Aviation charts',
    airspaces: 'Airspaces',
    airports: 'Airports',
    openAipKeyRequired: 'Add your OpenAIP key in Settings → Integrations',
    airportCategories: 'Airport categories',
    catInternational: 'International & Hubs',
    catRegional: 'Regional',
    catCargo: 'Cargo Hubs',
    catMilitary: 'Military Bases',
    catLocal: 'Local / GA',
    dailySatellite: 'Daily satellite',
    imageryDate: 'Imagery date',
  },

  // Trips Tab
  tripsTab: {
    show: 'Show',
    showAll: 'All / None',
    showNone: 'None',
    showFlights: 'Flights',
    showLandSea: 'Land & sea',
    showScratch: 'Scratch map',

    // Airports
    airportsSection: 'Airports',
    airportSize: 'Airport size',
    sizeOff: 'Off',
    sizeSmall: 'Small',
    sizeMedium: 'Medium',
    sizeLarge: 'Large',
    sizeByTraffic: 'Size by traffic',
    runwayDetail: 'Runway detail',
    detailSimple: 'Simple',
    detailDetailed: 'Detailed',
    airportsOnly: 'Airports only',
    airportsOnlyHelper: 'Hides routes, cities and overlays',

    // Routes
    routesSection: 'Routes',
    routesColor: 'Color',
    colorGradient: 'Gradient',
    colorByFrequency: 'By frequency',
    colorSingle: 'Single',
    thickness: 'Thickness',
    thicknessThin: 'Thin',
    thicknessMedium: 'Medium',
    thicknessThick: 'Thick',
    animateRoutes: 'Animate routes',
    groupAirports: 'Group nearby airports',
    followRoadsAndRails: 'Follow roads & rails',

    // Scratch Map
    scratchSection: 'Scratch map',
    cityPins: 'City pins',
    highlightCountries: 'Highlight countries',
    livedIn: 'Lived in',
    layoversOnly: 'Layovers only',
    wishlist: 'Wishlist',
  },

  // Filter Tab
  filterTab: {
    clearFilters: 'Clear filters',
    status: 'Status',
    statusAll: 'All',
    statusPast: 'Past',
    statusUpcoming: 'Upcoming',
    statusPlanning: 'Planning',
    year: 'Year',
    allYears: 'All Years',
    fromAirport: 'From airport',
    toAirport: 'To airport',
    anyAirport: 'Any airport',
    dates: 'Dates',
    dateFrom: 'From',
    dateTo: 'To',
  },

  // Footer & Actions
  actions: {
    resetSettings: 'Reset settings',
    resetSettingsConfirm: 'Reset all map settings?',
    recenterMap: 'Recenter map',
    done: 'Done',
    cancel: 'Cancel',
    reset: 'Reset',
    close: 'Close',
  },
} as const;

export default MAP_SETTINGS_LABELS;
