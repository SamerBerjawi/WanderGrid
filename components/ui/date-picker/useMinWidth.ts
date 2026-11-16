import { useCallback, useSyncExternalStore } from 'react';

/** Whether the viewport is at least `px` wide (Untitled UI's `useBreakpoint`, for the pickers' one breakpoint). */
export const useMinWidth = (px: number): boolean => {
    const query = `(min-width: ${px}px)`;
    const subscribe = useCallback(
        (onChange: () => void) => {
            const mq = window.matchMedia(query);
            mq.addEventListener('change', onChange);
            return () => mq.removeEventListener('change', onChange);
        },
        [query]
    );
    return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);
};
