import React, { useState, useEffect, useRef } from 'react';

interface VirtualListItemProps {
  children: React.ReactNode;
  estimatedHeight?: number;
  rootMargin?: string;
  className?: string;
}

/**
 * High-performance progressive viewport windowing wrapper.
 * Unmounts complex subtrees when far outside the viewport (>600px)
 * to keep DOM node count low on long lists (flights, trips, timeline items),
 * while preserving exact scroll height through measured dimensions.
 */
export const VirtualListItem: React.FC<VirtualListItemProps> = React.memo(({
  children,
  estimatedHeight = 160,
  rootMargin = '600px 0px',
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setIsVisible(true);
        } else {
          if (el.offsetHeight > 0) {
            setMeasuredHeight(el.offsetHeight);
          }
          setIsVisible(false);
        }
      },
      { rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={
        !isVisible && measuredHeight
          ? { minHeight: `${measuredHeight}px` }
          : !isVisible
          ? { minHeight: `${estimatedHeight}px` }
          : undefined
      }
    >
      {isVisible ? children : null}
    </div>
  );
});

VirtualListItem.displayName = 'VirtualListItem';
export default VirtualListItem;
