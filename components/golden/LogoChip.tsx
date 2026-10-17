import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { dataService } from '../../services/mockDb';
import { CarrierLogo } from './tripUtils';

interface CarrierSettings { brandfetchApiKey?: string; carriers?: any[] }

let settingsPromise: Promise<CarrierSettings> | null = null;
/** One shared fetch of the workspace carrier settings (Brandfetch key and domain overrides) for every logo on screen. */
const loadCarrierSettings = (): Promise<CarrierSettings> => {
  if (!settingsPromise) {
    settingsPromise = dataService.getWorkspaceSettings()
      .then((s: any) => ({ brandfetchApiKey: s?.brandfetchApiKey, carriers: s?.carriers }))
      .catch(() => ({}));
  }
  return settingsPromise;
};

const SIZE = { sm: 'w-6 h-6 rounded-lg', md: 'w-8 h-8 rounded-xl', lg: 'w-11 h-11 rounded-2xl' } as const;

/**
 * Operator logo (airline, rail, ferry, car rental) on a white chip. Falls back to `fallback`
 * (usually a Hugeicons mode icon) when no logo can be resolved.
 */
export const LogoChip: React.FC<{ provider?: string; fallback: React.ReactNode; size?: keyof typeof SIZE; className?: string }> = ({
  provider, fallback, size = 'md', className,
}) => {
  const [settings, setSettings] = useState<CarrierSettings>({});
  useEffect(() => { let on = true; loadCarrierSettings().then(s => on && setSettings(s)); return () => { on = false; }; }, []);
  return (
    <span className={twMerge(clsx('inline-flex items-center justify-center shrink-0 overflow-hidden bg-white text-sunset-ink', SIZE[size]), className)}>
      <CarrierLogo provider={provider} brandfetchApiKey={settings.brandfetchApiKey} carriers={settings.carriers} fallback={fallback} />
    </span>
  );
};

export default LogoChip;
