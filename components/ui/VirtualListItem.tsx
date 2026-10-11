import React, { useState, useEffect, useRef } from 'react';

interface VirtualListItemProps {
  children: React.ReactNode;
  estimatedHeight?: number;
  minHeight?: number;
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
  minHeight,
  rootMargin = '600px 0px',
  className = '',
}) => {
  const effectiveHeight = minHeight ?? estimatedHeight;
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

    // Observe against the nearest scrolling ancestor (the app scrolls <main>, not the window). With the
    // viewport as root, ancestor clipping made rootMargin useless: rows just below the fold were never
    // mounted, so they were invisible to find-in-page, screen readers and automation.
    const findScrollRoot = (node: HTMLElement | null): Element | null => {
      for (let n = node?.parentElement; n; n = n.parentElement) {
        const overflowY = getComputedStyle(n).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && n.scrollHeight > n.clientHeight) return n;
      }
      return null;
    };

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
      { root: findScrollRoot(el), rootMargin }
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
          ? { minHeight: `${effectiveHeight}px` }
          : undefined
      }
    >
      {isVisible ? children : null}
    </div>
  );
});

VirtualListItem.displayName = 'VirtualListItem';
export default VirtualListItem;
