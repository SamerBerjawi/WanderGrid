import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Carrier } from '../../types';
import type { Icon } from '../ui/hugeicons';
import { resolveCarrierLogo } from '../../utils/carrierLogoResolver';
import { LogoChip } from './ui';
import { dataService } from '../../services/mockDb';
import { affectsCollections } from '../../hooks/useWanderSync';

/**
 * The carriers list and Brandfetch key from Settings, read once for the whole shell so every logo on every
 * page is resolved from the same source (Settings > Carriers). It reloads when settings change, so editing a
 * carrier updates the logos on screen without a reload.
 */
interface CarrierLogoConfig { carriers: Carrier[]; brandfetchApiKey?: string }

const EMPTY: CarrierLogoConfig = { carriers: [] };
const Ctx = createContext<CarrierLogoConfig>(EMPTY);

export const useCarrierLogoConfig = () => useContext(Ctx);

export const CarrierLogoProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<CarrierLogoConfig>(EMPTY);
    useEffect(() => {
        let alive = true;
        const load = () => {
            dataService.getWorkspaceSettings()
                .then(s => { if (alive) setConfig({ carriers: s.carriers ?? [], brandfetchApiKey: s.brandfetchApiKey || undefined }); })
                .catch(() => undefined);
        };
        load();
        const onUpdate = (e: Event) => { if (affectsCollections(e, ['settings'])) load(); };
        window.addEventListener('wandergrid_db_updated', onUpdate);
        return () => { alive = false; window.removeEventListener('wandergrid_db_updated', onUpdate); };
    }, []);
    const value = useMemo(() => config, [config]);
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

/**
 * The logo of a flight's (or any transport's) carrier: the entry in Settings > Carriers, drawn the way
 * Settings draws it; the mode icon when none is configured. Carriers and key come from the shell; pass them
 * only to override.
 */
export const RpCarrierLogo: React.FC<{
    provider?: string;
    /** The journey number; its letters identify the carrier when the provider is not listed. */
    identifier?: string;
    /** A logo URL saved with the record; used only when the carrier is not configured. */
    src?: string;
    carriers?: Carrier[];
    brandfetchApiKey?: string;
    fallback: Icon;
    iconClassName?: string;
    size?: 'sm' | 'md';
    className?: string;
}> = ({ provider, identifier, src, carriers, brandfetchApiKey, fallback, iconClassName, size, className }) => {
    const ctx = useCarrierLogoConfig();
    const list = carriers ?? ctx.carriers;
    const key = brandfetchApiKey ?? ctx.brandfetchApiKey;
    const sources = useMemo(
        () => resolveCarrierLogo({ provider, identifier }, { carriers: list, brandfetchApiKey: key, saved: src }).sources,
        [provider, identifier, src, list, key]
    );
    return <LogoChip sources={sources} alt={provider ? `${provider} logo` : ''} fallback={fallback} iconClassName={iconClassName} size={size} className={className} />;
};
