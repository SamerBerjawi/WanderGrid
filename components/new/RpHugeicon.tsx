import React, { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { loadHugeicons, type HugeiconData, type HugeiconLibrary } from '../../utils/hugeiconsLibrary';

/** A Hugeicons free icon by name. Shows `fallback` until the icon set has loaded (or if the name is unknown). */
export const RpHugeicon: React.FC<{ name?: string; size?: number; strokeWidth?: number; className?: string; fallback?: React.ReactNode; data?: HugeiconData }> = ({
    name, size = 18, strokeWidth = 1.5, className, fallback = null, data: saved,
}) => {
    const [lib, setLib] = useState<HugeiconLibrary | null>(null);
    useEffect(() => {
        // The drawing saved with the trip needs no icon set; only older trips without it load the set.
        if (!name || saved) return;
        let live = true;
        loadHugeicons().then(l => { if (live) setLib(l); }).catch(() => undefined);
        return () => { live = false; };
    }, [name, saved]);
    const data: HugeiconData | undefined = saved ?? (name && lib ? lib[name] : undefined);
    if (!data) return <>{fallback}</>;
    return <HugeiconsIcon icon={data} size={size} strokeWidth={strokeWidth} color="currentColor" className={className} aria-hidden />;
};
