import React, { useState, useEffect, useRef } from 'react';
import { Info, X, ArrowSquareOut, ShieldCheck } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'motion/react';
import GlassPanel from './glass/GlassPanel';
import { MapAppearanceSettings } from '../types/mapAppearance';
import { FEATURE_FLAGS } from '../config/featureFlags';

export interface DataCreditsPopoverProps {
  currentBasemap: string;
  activeAppearance: MapAppearanceSettings;
  className?: string;
}

interface CreditItem {
  layer: string;
  provider: string;
  license: string;
  url: string;
  isActive: boolean;
}

export const DataCreditsPopover: React.FC<DataCreditsPopoverProps> = ({
  currentBasemap,
  activeAppearance,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!FEATURE_FLAGS.GEV_P07_DATA_CREDITS) return null;

  // Dynamically resolve active credits based on map state
  const isOFM = currentBasemap.startsWith('ofm_') || currentBasemap === 'liberty' || currentBasemap === 'bright';
  const isSatellite = currentBasemap.includes('satellite');
  const isNASA = currentBasemap === 'citylights';
  const isOcean = currentBasemap === 'ocean';

  const credits: CreditItem[] = [
    {
      layer: 'Base Map',
      provider: isOFM ? 'OpenFreeMap' : isSatellite ? 'Esri Satellite' : isNASA ? 'NASA EOSDIS GIBS' : isOcean ? 'Esri Ocean / GEBCO' : 'CARTO Basemaps',
      license: isSatellite ? 'Esri, Maxar, Earthstar Geographics' : isNASA ? 'NASA EOSDIS GIBS' : isOcean ? 'Source: Esri, GEBCO, NOAA' : '© OpenStreetMap contributors',
      url: isOFM ? 'https://openfreemap.org' : isSatellite ? 'https://www.esri.com' : isNASA ? 'https://earthdata.nasa.gov' : isOcean ? 'https://www.gebco.net' : 'https://carto.com',
      isActive: true
    },
    {
      layer: '3D Elevation Mesh',
      provider: 'AWS Elevation Tiles',
      license: 'Mapzen Terrarium DEM (Amazon S3)',
      url: 'https://registry.opendata.aws/terrain-tiles/',
      isActive: Boolean(activeAppearance.terrain3d)
    },
    {
      layer: 'Topographic Relief',
      provider: 'Esri World Hillshade',
      license: 'USGS, NGA, Esri Relief',
      url: 'https://www.arcgis.com/home/item.html?id=58a541ced03b4105918869fb711a76c8',
      isActive: Boolean(activeAppearance.terrainHillshade)
    },
    {
      layer: 'Daily Satellite Mosaic',
      provider: 'NASA EOSDIS GIBS',
      license: 'VIIRS NOAA-21 True-Color Corrected',
      url: 'https://earthdata.nasa.gov/eosdis',
      isActive: Boolean(activeAppearance.gibsDaily)
    },
    {
      layer: 'Weather Radar',
      provider: 'RainViewer',
      license: 'Real-time Precipitation Telemetry',
      url: 'https://www.rainviewer.com',
      isActive: Boolean(activeAppearance.rainRadar)
    },
    {
      layer: 'Rail & Transit',
      provider: 'OpenRailwayMap',
      license: 'ODbL © OpenStreetMap contributors',
      url: 'https://www.openrailwaymap.org',
      isActive: Boolean(activeAppearance.transitOverlay)
    },
    {
      layer: 'Road Routing',
      provider: 'FOSSGIS e.V. OSRM',
      license: 'Routing Service © OpenStreetMap',
      url: 'https://routing.openstreetmap.de',
      isActive: true
    },
    {
      layer: 'Geocoding & Places',
      provider: 'Open-Meteo & Photon',
      license: 'CC-BY 4.0 / OpenStreetMap contributors',
      url: 'https://open-meteo.com',
      isActive: true
    },
    {
      layer: 'Flight Telemetry',
      provider: 'ADSBdb & AviationStack',
      license: 'ICAO Aerodromes & Flight Routes',
      url: 'https://adsbdb.com',
      isActive: true
    }
  ];

  const activeCredits = credits.filter(c => c.isActive);

  return (
    <div ref={popoverRef} className={`relative ${className}`}>
      {/* Floating Trigger Pill */}
      <GlassPanel
        padding="0px"
        overrides={{ borderRadius: 999 }}
        className="wg-glass-pill shadow-glass-modal pointer-events-auto"
      >
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer active:scale-95"
          title="Data Credits & Attribution"
          aria-label="View data credits and attribution"
          aria-expanded={isOpen}
        >
          <Info size={18} weight="bold" />
        </button>
      </GlassPanel>

      {/* Popover Card */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute bottom-13 right-0 z-popover w-[340px] sm:w-[380px] pointer-events-auto"
          >
            <GlassPanel
              className="wg-glass-card shadow-2xl overflow-hidden border border-black/10 dark:border-white/15"
              overrides={{ borderRadius: 24 }}
              padding="0px"
            >
              <div className="flex flex-col max-h-[440px] overflow-hidden rounded-[24px]">
                {/* Header */}
                <div className="p-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-primary-500/10 via-primary-500/5 to-transparent shrink-0">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary-500" weight="bold" />
                    <div>
                      <h3 className="text-xs font-bold text-light-text dark:text-dark-text tracking-tight uppercase">
                        Data Credits & Sources
                      </h3>
                      <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary">
                        Active providers & attributions
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
                    aria-label="Close data credits"
                  >
                    <X size={16} weight="bold" />
                  </button>
                </div>

                {/* Content List */}
                <div className="p-4 space-y-2 overflow-y-auto custom-scrollbar flex-1">
                  {activeCredits.map((c, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-white/40 dark:bg-white/[0.03] backdrop-blur-sm border border-black/5 dark:border-white/5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-2xs font-bold text-light-text dark:text-dark-text tracking-tight">
                            {c.provider}
                          </span>
                          <span className="px-1.5 py-0.2 rounded-full text-2xs font-bold uppercase tracking-wider bg-primary-500/10 text-primary-600 dark:text-primary-400">
                            {c.layer}
                          </span>
                        </div>
                        <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
                          {c.license}
                        </p>
                      </div>

                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-light-text-secondary hover:text-primary-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
                        title={`Visit ${c.provider}`}
                        aria-label={`Visit ${c.provider} website`}
                      >
                        <ArrowSquareOut size={16} />
                      </a>
                    </div>
                  ))}
                </div>

                {/* Footer Note */}
                <div className="p-3 border-t border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 text-center shrink-0">
                  <p className="text-2xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
                    All map & telemetry data rendered under respective open licenses
                  </p>
                </div>
              </div>
            </GlassPanel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
