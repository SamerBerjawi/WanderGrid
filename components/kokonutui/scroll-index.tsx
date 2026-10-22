/**
 * KokonutUI Scroll Index (registry slug `scroll-index`), ported for WanderGrid's New pages:
 * rp-* tokens, Tailwind 3 variants, a `railClassName` (so pages can hide the rail on small
 * screens) and no sample article.
 *
 * @author: @dorianbaffier
 * @description: Scroll Index
 * @version: 1.0.0
 * @date: 2026-10-15
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/utils/cn";

export interface ScrollIndexProps {
  /** The content to index. */
  children?: ReactNode;
  /** Which headings get a tick. */
  selector?: string;
  /**
   * `self`: the component scrolls its own box (default).
   * `window`: the page scrolls and the rail sticks beside the content.
   */
  scroller?: "self" | "window";
  className?: string;
  /** Classes for the content box (its default padding leaves room for the rail). */
  contentClassName?: string;
  /** Extra classes on the rail, e.g. `hidden lg:flex`. */
  railClassName?: string;
}

interface Section {
  el: HTMLElement;
  text: string;
  level: number;
  /** Scroll position that brings the heading to the top. */
  at: number;
  /** Where its tick sits on the rail, 0 to 1. */
  pos: number;
}

// The rail is this tall at most, in px; ticks sit at the scroll position of
// their heading, so long sections leave long gaps.
const RAIL = 280;
// Headings land this far below the top edge when jumped to.
const OFFSET = 16;
// Ticks swell near the pointer like a dock: peak width and reach, in px.
const SWELL = 1.6;
const REACH = 26;
// A drag let go this close to a tick (after its momentum) settles on it.
const SNAP = 18;
// How long the flashed section name stays up after scrolling into it.
const FLASH = 900;

function easeInOut(t: number) {
  return t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2;
}

export default function ScrollIndex({
  children,
  selector = "h2, h3",
  scroller = "self",
  className,
  railClassName,
  contentClassName,
}: ScrollIndexProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const tickRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [sections, setSections] = useState<
    { text: string; level: number; pos: number }[]
  >([]);
  // The effect below reads and writes these without re-rendering.
  const api = useRef<{
    jump: (index: number) => void;
    show: (i: number) => void;
  }>({ jump: () => undefined, show: () => undefined });

  useEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    const rail = railRef.current;
    const head = headRef.current;
    const label = labelRef.current;
    if (!(box && content && rail && head && label)) {
      return;
    }
    const usesWindow = scroller === "window";
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let list: Section[] = [];
    let start = 0;
    let end = 1;
    let active = -1;
    let height = RAIL;
    let raf = 0;
    let tween = 0;
    let flashTimer = 0;
    let painted = false;
    let hover: number | null = null;
    let drag: {
      id: number;
      moved: boolean;
      y: number;
      t: number;
      v: number;
    } | null = null;
    const swell: number[] = [];

    const getScroll = () => (usesWindow ? window.scrollY : box.scrollTop);
    const setScroll = (value: number) => {
      if (usesWindow) {
        window.scrollTo(0, value);
      } else {
        box.scrollTop = value;
      }
    };

    const measure = () => {
      const scroll = getScroll();
      if (usesWindow) {
        const top = content.getBoundingClientRect().top + scroll;
        start = Math.max(top - OFFSET, 0);
        end = Math.max(
          top + content.offsetHeight - window.innerHeight,
          start + 1
        );
      } else {
        start = 0;
        end = Math.max(box.scrollHeight - box.clientHeight, 1);
      }
      const origin = usesWindow ? 0 : box.getBoundingClientRect().top - scroll;
      list = Array.from(content.querySelectorAll<HTMLElement>(selector)).map(
        (el) => {
          const at = Math.min(
            Math.max(
              el.getBoundingClientRect().top + scroll - origin - OFFSET,
              start
            ),
            end
          );
          return {
            el,
            text: el.dataset.indexLabel?.trim() || el.textContent?.trim() || "",
            level: Number(el.tagName.slice(1)) || 2,
            at,
            pos: (at - start) / (end - start),
          };
        }
      );
      height = rail.clientHeight || RAIL;
      setSections(list.map(({ text, level, pos }) => ({ text, level, pos })));
    };

    const fraction = () =>
      Math.min(Math.max((getScroll() - start) / (end - start), 0), 1);

    const nearest = (y: number) => {
      let best = -1;
      let distance = Number.POSITIVE_INFINITY;
      list.forEach((s, i) => {
        const d = Math.abs(s.pos * height - y);
        if (d < distance) {
          distance = d;
          best = i;
        }
      });
      return { index: best, distance };
    };

    const placeLabel = (index: number, visible: boolean) => {
      const section = list[index];
      if (!section) {
        label.style.opacity = "0";
        return;
      }
      if (label.textContent !== section.text) {
        label.textContent = section.text;
      }
      label.style.transform = `translate3d(0, ${(section.pos * height).toFixed(1)}px, 0) translateY(-50%)`;
      label.style.opacity = visible ? "1" : "0";
    };

    /** Section the reader is in: the last heading at or above the top. */
    const current = () => {
      const scroll = getScroll() + 1;
      let index = -1;
      for (let i = 0; i < list.length; i++) {
        if (list[i].at <= scroll) {
          index = i;
        }
      }
      return index;
    };

    const paint = () => {
      raf = 0;
      head.style.transform = `translate3d(0, ${(fraction() * height).toFixed(1)}px, 0)`;
      const now = current();
      if (now !== active) {
        active = now;
        tickRefs.current.forEach((tick, i) => {
          if (tick) {
            // The section being read is marked apart from the ones passed.
            let state = "ahead";
            if (i === active) {
              state = "current";
            } else if (i < active) {
              state = "passed";
            }
            tick.dataset.state = state;
          }
        });
        // Scrolling into a new section names it briefly.
        if (painted && hover === null && !drag && active >= 0) {
          placeLabel(active, true);
          window.clearTimeout(flashTimer);
          flashTimer = window.setTimeout(() => {
            if (hover === null && !drag) {
              label.style.opacity = "0";
            }
          }, FLASH);
        }
      }
      // Ticks ease toward their swell, so the magnification follows the
      // pointer smoothly instead of jumping.
      let moving = false;
      tickRefs.current.forEach((tick, i) => {
        if (!tick) {
          return;
        }
        const y = (list[i]?.pos ?? 0) * height;
        const target =
          hover === null || reduceMotion
            ? 1
            : 1 + SWELL * Math.exp(-((hover - y) ** 2) / (2 * REACH * REACH));
        const value = (swell[i] ?? 1) + (target - (swell[i] ?? 1)) * 0.35;
        swell[i] = Math.abs(value - target) < 0.005 ? target : value;
        moving ||= swell[i] !== target;
        tick.style.setProperty("--swell", swell[i].toFixed(3));
      });
      painted = true;
      if (moving) {
        schedule();
      }
    };

    function schedule() {
      if (!raf) {
        raf = requestAnimationFrame(paint);
      }
    }

    const stopTween = () => {
      cancelAnimationFrame(tween);
      tween = 0;
    };

    const scrollTo = (target: number) => {
      stopTween();
      const from = getScroll();
      const to = Math.min(Math.max(target, 0), usesWindow ? 1e9 : end);
      if (reduceMotion || Math.abs(to - from) < 2) {
        setScroll(to);
        return;
      }
      const duration = Math.min(
        Math.max(260 + Math.abs(to - from) * 0.12, 300),
        650
      );
      const begin = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - begin) / duration, 1);
        setScroll(from + (to - from) * easeInOut(t));
        tween = t < 1 ? requestAnimationFrame(step) : 0;
      };
      tween = requestAnimationFrame(step);
    };

    api.current = {
      jump: (index) => {
        const section = list[index];
        if (section) {
          scrollTo(section.at);
        }
      },
      show: (index) => {
        hover = (list[index]?.pos ?? 0) * height;
        placeLabel(index, true);
        schedule();
      },
    };

    const railY = (event: PointerEvent) =>
      Math.min(
        Math.max(event.clientY - rail.getBoundingClientRect().top, 0),
        height
      );

    const scrub = (y: number) =>
      setScroll(start + (y / height) * (end - start));

    const onDown = (event: PointerEvent) => {
      if (drag || event.button !== 0) {
        return;
      }
      event.preventDefault();
      rail.setPointerCapture(event.pointerId);
      stopTween();
      const y = railY(event);
      drag = { id: event.pointerId, moved: false, y, t: event.timeStamp, v: 0 };
      hover = y;
      rail.dataset.dragging = "";
      placeLabel(nearest(y).index, true);
      schedule();
    };

    const onMove = (event: PointerEvent) => {
      const y = railY(event);
      if (drag && event.pointerId === drag.id) {
        const dt = Math.max(event.timeStamp - drag.t, 1);
        drag.v = drag.v * 0.4 + ((y - drag.y) / dt) * 0.6;
        drag.moved ||= Math.abs(y - drag.y) > 3;
        drag.y = y;
        drag.t = event.timeStamp;
        if (drag.moved) {
          // Dragging the rail scrubs the page under it.
          scrub(y);
        }
      } else if (event.pointerType !== "mouse") {
        return;
      }
      hover = y;
      placeLabel(nearest(y).index, true);
      schedule();
    };

    const onUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) {
        return;
      }
      const { moved, y, v } = drag;
      drag = null;
      delete rail.dataset.dragging;
      if (event.pointerType !== "mouse") {
        hover = null;
        placeLabel(-1, false);
      }
      // Where the flick was heading, then the tick nearest that.
      const projected = moved ? y + v * 120 : y;
      const hit = nearest(projected);
      if (hit.index >= 0 && (!moved || hit.distance < SNAP)) {
        api.current.jump(hit.index);
      }
      schedule();
    };

    const onLeave = () => {
      if (drag) {
        return;
      }
      hover = null;
      placeLabel(-1, false);
      schedule();
    };

    const scrollTarget: HTMLElement | Window = usesWindow ? window : box;
    const onScroll = () => schedule();
    // Any scroll input of the reader's own cancels a jump in progress.
    const onInput = () => stopTween();

    measure();
    paint();
    const resize = new ResizeObserver(() => {
      measure();
      schedule();
    });
    resize.observe(content);
    resize.observe(box);
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    scrollTarget.addEventListener("wheel", onInput, { passive: true });
    scrollTarget.addEventListener("touchstart", onInput, { passive: true });
    rail.addEventListener("pointerdown", onDown);
    rail.addEventListener("pointermove", onMove);
    rail.addEventListener("pointerup", onUp);
    rail.addEventListener("pointercancel", onUp);
    rail.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      stopTween();
      window.clearTimeout(flashTimer);
      resize.disconnect();
      scrollTarget.removeEventListener("scroll", onScroll);
      scrollTarget.removeEventListener("wheel", onInput);
      scrollTarget.removeEventListener("touchstart", onInput);
      rail.removeEventListener("pointerdown", onDown);
      rail.removeEventListener("pointermove", onMove);
      rail.removeEventListener("pointerup", onUp);
      rail.removeEventListener("pointercancel", onUp);
      rail.removeEventListener("pointerleave", onLeave);
    };
  }, [selector, scroller]);

  const onTickKey = (index: number, event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const next = Math.min(
      Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0),
      sections.length - 1
    );
    tickRefs.current[next]?.focus();
  };

  const self = scroller === "self";

  return (
    <div
      className={cn(
        "relative w-full",
        self &&
          "h-[520px] overflow-hidden rounded-2xl border border-rp-line bg-rp-surface ",
        !self && "grid grid-cols-[minmax(0,1fr)_3rem] gap-6",
        className
      )}
    >
      <div
        className={cn(self && "h-full overflow-y-auto overscroll-contain")}
        ref={boxRef}
      >
        <div
          className={cn(self && "py-8 pr-16 pl-6 sm:pl-10", contentClassName)}
          ref={contentRef}
        >
          {children}
        </div>
      </div>

      <nav
        aria-label="Sections"
        className={cn(
          "z-raised flex w-12 justify-end",
          self
            ? "absolute top-1/2 right-3 -translate-y-1/2"
            : "sticky top-[calc(50vh-140px)] h-fit self-start",
          railClassName
        )}
      >
        <div
          className="relative w-full cursor-pointer touch-none select-none data-[dragging]:cursor-grabbing"
          ref={railRef}
          style={{ height: RAIL }}
        >
          {sections.map((section, index) => (
            <button
              aria-label={section.text}
              className={cn(
                "group absolute right-0 h-4 -translate-y-1/2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-rp-muted",
                section.level <= 2 ? "w-3.5" : "w-2"
              )}
              data-state="ahead"
              key={`${index}-${section.text}`}
              onBlur={() => labelRef.current?.style.setProperty("opacity", "0")}
              onClick={(event) => {
                // Pointer clicks are handled by the rail; this is the keyboard.
                if (event.detail === 0) {
                  api.current.jump(index);
                }
              }}
              onFocus={() => api.current.show(index)}
              onKeyDown={(event) => onTickKey(index, event)}
              ref={(el) => {
                tickRefs.current[index] = el;
              }}
              style={{ top: `${(section.pos * 100).toFixed(3)}%` }}
              tabIndex={0}
              type="button"
            >
              <span className="absolute top-1/2 right-0 h-[1.5px] w-full origin-right -translate-y-1/2 scale-x-[var(--swell,1)] rounded-full bg-rp-line transition-colors duration-200 ease-out group-data-[state=current]:h-[2px] group-data-[state=current]:bg-rp-ink group-data-[state=passed]:bg-rp-muted" />
            </button>
          ))}
          {/* Where the reader is, between ticks too. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-0 h-[2px] w-6 -translate-y-1/2 rounded-full bg-rp-ink will-change-transform"
            ref={headRef}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-9 whitespace-nowrap rounded-full bg-rp-surface px-3 py-1.5 font-medium text-xs text-rp-ink opacity-0 rp-shadow-soft transition-[opacity,transform] duration-150 ease-out"
            ref={labelRef}
          />
        </div>
      </nav>
    </div>
  );
}
