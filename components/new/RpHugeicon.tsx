import React, { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { loadHugeicons, type HugeiconData, type HugeiconLibrary } from '../../utils/hugeiconsLibrary';

/** A Hugeicons free icon by name. Shows `fallback` until the icon set has loaded (or if the name is unknown). */
export const RpHugeicon: React.FC<{ name?: string; size?: number; strokeWidth?: number; className?: string; fallback?: React.ReactNode }> = ({
    name, size = 18, strokeWidth = 1.5, className, fallback = null,
}) => {
    const [lib, setLib] = useState<HugeiconLibrary | null>(null);
    useEffect(() => {
        if (!name) return;
        let live = true;
        loadHugeicons().then(l => { if (live) setLib(l); }).catch(() => undefined);
        return () => { live = false; };
    }, [name]);
    const data: HugeiconData | undefined = name && lib ? lib[name] : undefined;
    if (!data) return <>{fallback}</>;
    return <HugeiconsIcon icon={data} size={size} strokeWidth={strokeWidth} color="currentColor" className={className} aria-hidden />;
};
