/**
 * KokonutUI Swipe Tabs (registry slug `smooth-tab`), ported for WanderGrid's New pages:
 * rp-* tokens, adapter icons, 44px tabs, an optional per-tab badge, and a tabs-only mode
 * (`panels={false}`) for segmented switches with no swipeable panel.
 *
 * @author: @dorianbaffier
 * @description: Swipe Tabs
 * @version: 2.0.0
 * @date: 2026-10-14
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import {
  type AnimationPlaybackControls,
  animate,
  useMotionValue,
} from "motion/react";
import {
  type ComponentType,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/utils/cn";

export interface SwipeTabItem {
  id: string;
  title: string;
  /** Shown before the title in the tab. */
  // biome-ignore lint/suspicious/noExplicitAny: accepts any icon component (Hugeicons adapter, SVG components)
  icon?: ComponentType<any>;
  /** Shown after the title, such as a count. */
  badge?: ReactNode;
  /** Hide the visible title (icon-only tab); `title` stays the accessible name. */
  hideTitle?: boolean;
  /** Colour classes for the icon while the tab is not selected (an accent). */
  iconClassName?: string;
  /** The panel shown for this tab. */
  content?: ReactNode;
}

export interface SmoothTabProps {
  items: SwipeTabItem[];
  defaultTabId?: string;
  /** The selected tab id, for a controlled tab. Pair it with `onChange`. */
  value?: string;
  onChange?: (tabId: string) => void;
  className?: string;
  /** Background classes for the indicator: the one accent. */
  activeColor?: string;
  /** Text color classes for the label sitting on the indicator. */
  activeTextColor?: string;
  /** Accessible name for the tab list. */
  label?: string;
  /** `false` renders only the tab list (a segmented switch). Default `true`. */
  panels?: boolean;
  /** Classes for the tab list pill. */
  listClassName?: string;
  /** Classes for the panel box. */
  panelClassName?: string;
  /** Tighter tab padding, for segmented rows in narrow panels. */
  compact?: boolean;
  /** Tabs share the full width of the list. */
  stretch?: boolean;
}

// Past the first or last tab the panel moves this fraction of the drag.
const RUBBER_BAND = 0.35;
// A release this fast (px per ms) changes tab however short the drag was.
const SWIPE_VELOCITY = 0.11;
// Movement before deciding between a horizontal swipe and a vertical scroll.
const AXIS_LOCK = 6;
// Release velocity is measured over the last stretch of the drag only.
const VELOCITY_WINDOW = 100;
// A panel one full width away sits at this opacity, so the neighbour reads
// as "next" while it slides in.
const NEIGHBOUR_OPACITY = 0.35;
// Just under critical damping: a firm settle, a hint of overshoot only after
// a fast flick.
const SPRING = { type: "spring", stiffness: 420, damping: 38 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

interface TabRect {
  left: number;
  width: number;
  top: number;
  height: number;
}

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  startProgress: number;
  axis: "x" | "y" | null;
  width: number;
  samples: { x: number; t: number }[];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

/** The indicator rectangle at a fractional tab position. */
function indicatorRect(rects: TabRect[], progress: number): TabRect | null {
  const last = rects.length - 1;
  if (last < 0) {
    return null;
  }
  const p = clamp(progress, 0, last);
  const i = Math.min(Math.floor(p), Math.max(last - 1, 0));
  const a = rects[i];
  const b = rects[Math.min(i + 1, last)];
  const t = p - i;
  let left = lerp(a.left, b.left, t);
  let width = lerp(a.width, b.width, t);
  // Rubber-banding past an end: the pill presses against the wall and gives
  // on the far side instead of sliding out of the track.
  const over = progress < 0 ? -progress : progress - last;
  if (over > 0) {
    const squash = width * Math.min(over, 0.5) * 0.4;
    width -= squash;
    if (progress > last) {
      left += squash;
    }
  }
  return { left, width, top: a.top, height: a.height };
}

/** Rubber-bands a raw position that runs past the first or last tab. */
function rubberBand(raw: number, last: number): number {
  if (raw < 0) {
    return raw * RUBBER_BAND;
  }
  if (raw > last) {
    return last + (raw - last) * RUBBER_BAND;
  }
  return raw;
}

export default function SmoothTab({
  items,
  defaultTabId,
  value,
  onChange,
  className,
  activeColor = "bg-rp-ink",
  activeTextColor = "text-rp-on-ink",
  label = "Sections",
  panels = true,
  listClassName,
  panelClassName,
  compact = false,
  stretch = false,
}: SmoothTabProps) {
  const pad = compact ? "px-3" : "px-4";
  // The panel box takes the height of the selected panel, not the tallest one.
  const [panelHeight, setPanelHeight] = useState<number | undefined>(undefined);
  const count = items.length;
  const indexOf = (id: string | undefined) =>
    Math.max(
      items.findIndex((item) => item.id === id),
      0
    );

  const [uncontrolled, setUncontrolled] = useState(() => indexOf(defaultTabId));
  const selected =
    value === undefined
      ? clamp(uncontrolled, 0, Math.max(count - 1, 0))
      : indexOf(value);
  // Captured once, so React never rewrites the imperatively painted styles.
  const [initial] = useState(selected);

  // Fractional tab position: 0 … count - 1, beyond while rubber-banding.
  // It drives the panel track, the indicator and the label clip directly,
  // so a drag never re-renders React.
  const progress = useMotionValue(selected);

  const baseId = useId();
  const tablistRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rects = useRef<TabRect[]>([]);
  const size = useRef({ width: 0, height: 0 });
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const target = useRef(selected);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const reducedMotion = useRef(false);
  const latest = useRef({ count, items, selected, onChange });
  latest.current = { count, items, selected, onChange };

  const paint = useCallback(
    (p: number) => {
      const track = trackRef.current;
      if (track) {
        track.style.transform = `translate3d(${(-p * 100) / count}%, 0, 0)`;
      }
      panelRefs.current.forEach((panel, i) => {
        if (panel) {
          const d = Math.min(Math.abs(p - i), 1);
          panel.style.opacity = String(1 - d * (1 - NEIGHBOUR_OPACITY));
        }
      });
      const overlay = overlayRef.current;
      const r = indicatorRect(rects.current, p);
      if (overlay && r) {
        const right = size.current.width - r.left - r.width;
        const bottom = size.current.height - r.top - r.height;
        overlay.style.clipPath = `inset(${r.top}px ${right}px ${bottom}px ${r.left}px round ${r.height / 2}px)`;
      }
    },
    [count]
  );

  // Measure the tabs before paint, and again on resize and font load.
  useLayoutEffect(() => {
    const tablist = tablistRef.current;
    if (!tablist) {
      return;
    }
    let alive = true;
    const measure = () => {
      if (!alive) {
        return;
      }
      // Sub-pixel rects, so the clip lines up with the labels exactly.
      // Divided by the list's scale in case an ancestor is transformed.
      const box = tablist.getBoundingClientRect();
      const ratio = box.width / (tablist.offsetWidth || 1);
      // offsetWidth is rounded: only a real transform counts as a scale.
      const scale = Math.abs(ratio - 1) < 0.01 ? 1 : ratio;
      size.current = { width: box.width / scale, height: box.height / scale };
      rects.current = tabRefs.current.slice(0, count).map((tab) => {
        const r = tab?.getBoundingClientRect();
        return r
          ? {
              left: (r.left - box.left) / scale,
              width: r.width / scale,
              top: (r.top - box.top) / scale,
              height: r.height / scale,
            }
          : { left: 0, width: 0, top: 0, height: 0 };
      });
      paint(progress.get());
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tablist);
    document.fonts.ready.then(measure).catch(() => undefined);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [count, paint, progress]);

  useEffect(() => {
    const unsubscribe = progress.on("change", paint);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedMotion.current = query.matches;
    };
    sync();
    query.addEventListener("change", sync);
    return () => {
      unsubscribe();
      query.removeEventListener("change", sync);
      anim.current?.stop();
    };
  }, [paint, progress]);

  /** Moves the position to a tab. `velocity` is in tabs per second. */
  const settle = useCallback(
    (index: number, opts: { instant?: boolean; velocity?: number } = {}) => {
      target.current = index;
      anim.current?.stop();
      anim.current = null;
      if (opts.instant) {
        progress.jump(index);
        return;
      }
      anim.current = reducedMotion.current
        ? animate(progress, index, { duration: 0.15, ease: EASE_OUT })
        : animate(progress, index, { ...SPRING, velocity: opts.velocity ?? 0 });
    },
    [progress]
  );

  const select = useCallback(
    (index: number, opts?: { instant?: boolean; velocity?: number }) => {
      const { count: n, items: list, selected: current } = latest.current;
      const next = clamp(index, 0, n - 1);
      settle(next, opts);
      if (next !== current) {
        setUncontrolled(next);
        latest.current.onChange?.(list[next].id);
      }
    },
    [settle]
  );

  useEffect(() => {
    const panel = panelRefs.current[selected];
    if (!(panels && panel)) {
      return;
    }
    const measure = () => setPanelHeight(panel.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [selected, panels]);

  // A controlled `value` changed from outside: follow it.
  useEffect(() => {
    if (selected !== target.current && !drag.current) {
      settle(selected);
    }
  }, [selected, settle]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const keys: Record<string, number> = {
      ArrowRight: (i + 1) % count,
      ArrowLeft: (i - 1 + count) % count,
      Home: 0,
      End: count - 1,
    };
    const next = keys[e.key];
    if (next === undefined) {
      return;
    }
    e.preventDefault();
    tabRefs.current[next]?.focus();
    // A held key repeats faster than any spring settles: jump instead.
    select(next, { instant: e.repeat });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('input, textarea, select, [role="slider"], [data-no-swipe]')) {
      return;
    }
    if (count < 2 || (e.pointerType === "mouse" && e.button !== 0)) {
      return;
    }
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startProgress: progress.get(),
      axis: null,
      width: e.currentTarget.clientWidth || 1,
      samples: [{ x: e.clientX, t: e.timeStamp }],
    };
  };

  const lockAxis = (current: Drag, e: PointerEvent<HTMLDivElement>) => {
    const dx = e.clientX - current.startX;
    const dy = e.clientY - current.startY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK) {
      return;
    }
    // Vertical wins ties: the page scroll is what most people are after.
    current.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (current.axis === "x") {
      // Catch the panel mid-flight, and keep the swipe alive when the
      // pointer leaves the panel.
      anim.current?.stop();
      current.startProgress = progress.get();
      current.startX = e.clientX;
      current.samples = [{ x: e.clientX, t: e.timeStamp }];
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.dataset.dragging = "";
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== e.pointerId) {
      return;
    }
    if (current.axis === null) {
      lockAxis(current, e);
    }
    if (current.axis !== "x") {
      return;
    }
    current.samples.push({ x: e.clientX, t: e.timeStamp });
    while (
      current.samples.length > 2 &&
      e.timeStamp - current.samples[0].t > VELOCITY_WINDOW
    ) {
      current.samples.shift();
    }
    const raw =
      current.startProgress - (e.clientX - current.startX) / current.width;
    progress.set(rubberBand(raw, count - 1));
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const current = drag.current;
    if (!current || current.pointerId !== e.pointerId) {
      return;
    }
    drag.current = null;
    delete e.currentTarget.dataset.dragging;
    if (current.axis !== "x") {
      return;
    }
    // Swallow the click this release may send. A touch swipe sends none,
    // so the flag clears on the next tick instead of eating a later tap.
    if (!cancelled) {
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
    const first = current.samples[0];
    // px per ms; negative is a swipe towards the next tab.
    const vx = (e.clientX - first.x) / Math.max(e.timeStamp - first.t, 1);
    const p = progress.get();
    let next = Math.round(p);
    if (!cancelled && Math.abs(vx) > SWIPE_VELOCITY) {
      next = vx < 0 ? Math.floor(p) + 1 : Math.ceil(p) - 1;
    }
    // The spring starts at the finger's speed, so the hand-off is seamless.
    select(next, { velocity: (-vx * 1000) / current.width });
  };

  const tabId = (i: number) => `${baseId}-tab-${i}`;
  const panelId = (i: number) => `${baseId}-panel-${i}`;

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      {/* The list is as wide as its tabs, so the pill and the selected tab are never cut off: it is centred
          when there is room, and when there isn't the parent scrolls (auto margins, unlike justify-center,
          never push the start of the list out of reach). */}
      <div className={cn("flex", stretch && "w-full")}>
        <div
          aria-label={label}
          className={cn("relative rounded-full bg-rp-inset p-1", stretch ? "flex w-full min-w-max" : "mx-auto inline-flex shrink-0", listClassName)}
          ref={tablistRef}
          role="tablist"
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            const isSelected = i === selected;
            return (
              <button
                aria-controls={panels ? panelId(i) : undefined}
                aria-label={item.hideTitle ? item.title : undefined}
                aria-selected={isSelected}
                className={cn(
                  "relative flex min-h-11 items-center justify-center gap-1.5 rounded-full font-medium text-sm",
                  pad,
                  stretch ? "min-w-max flex-1" : "shrink-0",
                  "text-rp-muted transition-colors duration-150 ease-out hover:text-rp-ink",
                  "outline-none focus-visible:outline-2 focus-visible:outline-rp-line focus-visible:outline-offset-2"
                )}
                id={tabId(i)}
                key={item.id}
                onClick={() => select(i)}
                onKeyDown={(e) => handleKeyDown(e, i)}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                tabIndex={isSelected ? 0 : -1}
                type="button"
              >
                {Icon && <Icon aria-hidden="true" className={cn("size-4", item.iconClassName)} />}
                {item.hideTitle ? null : <span className="whitespace-nowrap">{item.title}</span>}
                {item.badge !== undefined ? <span className="rp-tabular text-xs opacity-70">{item.badge}</span> : null}
              </button>
            );
          })}
          {/* The same labels in the active color, clipped to the indicator,
              so each label is exactly right at every point of the slide with
              no color tween. */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 flex p-1 transition-colors duration-300",
              activeColor
            )}
            ref={overlayRef}
            style={{ clipPath: "inset(0 100% 0 0)" }}
          >
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <span
                  className={cn(
                    "flex min-h-11 items-center justify-center gap-1.5 font-medium text-sm",
                    pad,
                    stretch ? "min-w-max flex-1" : "shrink-0",
                    activeTextColor
                  )}
                  key={item.id}
                >
                  {Icon && <Icon className="size-4" />}
                  {item.hideTitle ? null : <span className="whitespace-nowrap">{item.title}</span>}
                  {item.badge !== undefined ? <span className="rp-tabular text-xs opacity-70">{item.badge}</span> : null}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {panels ? <div
        className={cn("relative touch-pan-y select-none overflow-hidden rounded-rp-inset bg-rp-surface transition-[height] duration-300 ease-out data-[dragging]:cursor-grabbing", panelClassName)}
        style={{ height: panelHeight }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onLostPointerCapture={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
      >
        <div
          className="flex items-start will-change-transform"
          ref={trackRef}
          style={{
            width: `${count * 100}%`,
            transform: `translate3d(${(-initial * 100) / count}%, 0, 0)`,
          }}
        >
          {items.map((item, i) => (
            <div
              aria-labelledby={tabId(i)}
              className="outline-none focus-visible:ring-2 focus-visible:ring-rp-line focus-visible:ring-inset"
              id={panelId(i)}
              inert={i !== selected}
              key={item.id}
              ref={(el) => {
                panelRefs.current[i] = el;
              }}
              role="tabpanel"
              style={{
                width: `${100 / count}%`,
                opacity: i === initial ? 1 : NEIGHBOUR_OPACITY,
              }}
              tabIndex={i === selected ? 0 : -1}
            >
              {item.content}
            </div>
          ))}
        </div>
      </div> : null}
    </div>
  );
}
