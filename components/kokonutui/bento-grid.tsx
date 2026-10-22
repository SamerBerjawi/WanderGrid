/**
 * KokonutUI Widget Grid (registry slug `bento-grid`), ported for WanderGrid's New pages: rp-* tokens
 * (solid `rp-surface` cards, a widget may take an accent fill), the Hugeicons adapter, no demo widgets,
 * and real items only. The lift, drag, resize, spring and keyboard engine is unchanged. Additions:
 * - `rows` (and `narrowRows`) per item, so a widget can be taller than one row;
 * - `tone` (surface, ink, green, mustard, rust) for an accent-filled widget, and `onOpen` for the
 *   card's up-right arrow, which opens the widget's page;
 * - `interactive` keeps a widget's own gestures (a chart scrub, a spinning ring) from starting a
 *   long-press lift: those widgets lift by their grip only;
 * - one column on narrow containers (the span stays in the saved layout, it is just not shown);
 * - the column count comes from the measured width, because container queries are not in this app's
 *   Tailwind.
 *
 * @author: @dorianbaffier
 * @description: Widget Grid
 * @version: 3.0.0
 * @date: 2026-10-14
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { ArrowDown, ArrowUp, ArrowUpRight, DotsSixVertical, EyeSlash } from "@/components/ui/hugeicons";
import { AnimatePresence, motion } from "motion/react";
import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/utils/cn";

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

export type WidgetSize = "s" | "m" | "l";

export interface WidgetGridItem {
  id: string;
  title: string;
  icon?: ReactNode;
  /** Renders the widget body for the size its column span maps to. */
  render: (size: WidgetSize) => ReactNode;
  /** Span used when no layout is given. Defaults to 2. */
  defaultSpan?: number;
  /** Grid rows the widget fills on the wide grid, or a function of its column span. Defaults to 1. */
  rows?: number | ((span: number) => number);
  /** Grid rows the widget fills in the single narrow column. Defaults to `rows`. */
  narrowRows?: number;
  /** Fill of the card. Defaults to the plain surface. */
  tone?: WidgetTone;
  /** The body runs edge to edge across the card (a rail that peeks past the padding). */
  flush?: boolean;
  /** The widget has its own pointer gestures: only the grip lifts it. */
  interactive?: boolean;
  /** Shows an up-right arrow in the header that opens the widget's page. */
  onOpen?: () => void;
  openLabel?: string;
}

export type WidgetTone = "surface" | "ink" | "green" | "mustard" | "rust";

export interface WidgetLayoutItem {
  id: string;
  /** Width in columns of the 6-column grid (2 to 6). */
  span: number;
  /** Height in grid rows (1 to 8). Left out, the widget's own `rows` apply. Width and height resize independently. */
  rows?: number;
}

export interface WidgetGridProps {
  items: WidgetGridItem[];
  /** Controlled order and spans. */
  layout?: WidgetLayoutItem[];
  /** Uncontrolled starting order and spans. */
  defaultLayout?: WidgetLayoutItem[];
  /** Called on every reorder or resize, including live moves while dragging. */
  onLayoutChange?: (layout: WidgetLayoutItem[]) => void;
  /**
   * Edit mode, for touch and anyone who prefers buttons to dragging: each widget shows Move up, Move
   * down and Hide in its header, so the whole layout can be arranged with taps.
   */
  editing?: boolean;
  onMoveItem?: (id: string, delta: -1 | 1) => void;
  onHideItem?: (id: string) => void;
  className?: string;
  /** Height of one row in pixels. */
  rowHeight?: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DragState {
  id: string;
  mode: "pointer" | "keyboard";
  /** The pointer holding the cell; other fingers are ignored. */
  pointerId: number;
  grabX: number;
  grabY: number;
  lastX: number;
  lastY: number;
  lastT: number;
  skipId: string | null;
  snapshot: WidgetLayoutItem[];
}

interface PressState {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  timer: number;
}

/* -------------------------------------------------------------------------- */
/*                                  Constants                                 */
/* -------------------------------------------------------------------------- */

const COLUMNS = 6;
const NARROW_COLUMNS = 1;
const MIN_SPAN = 2;
const MIN_ROWS = 2;
const MAX_ROWS = 8;
const GAP = 16;
/** Below this container width the grid is one column. */
const NARROW_BELOW = 640;
const LONG_PRESS_MS = 350;
const PRESS_SLOP = 8;
const LIFT_Z = 18;
const MAX_TILT = 7;
const SIZE_LABEL: Record<WidgetSize, string> = {
  s: "small",
  m: "medium",
  l: "large",
};

/** Maps a column span to the widget layout it shows. */
export function sizeForSpan(span: number, narrow = false): WidgetSize {
  if (narrow) {
    return "m";
  }
  if (span <= 2) {
    return "s";
  }
  return span <= 4 ? "m" : "l";
}

function clampSpan(span: number) {
  return Math.min(COLUMNS, Math.max(MIN_SPAN, Math.round(span)));
}

function clampRows(rows: number) {
  return Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.round(rows)));
}

/** In the narrow layout every widget takes the one column. */
function narrowSpan(_span: number) {
  return 1;
}

function normalizeLayout(
  layout: WidgetLayoutItem[],
  items: WidgetGridItem[]
): WidgetLayoutItem[] {
  const known = new Set(items.map((item) => item.id));
  const seen = new Set<string>();
  const out: WidgetLayoutItem[] = [];
  for (const entry of layout) {
    if (known.has(entry.id) && !seen.has(entry.id)) {
      seen.add(entry.id);
      out.push({
        id: entry.id,
        span: clampSpan(entry.span),
        ...(entry.rows ? { rows: clampRows(entry.rows) } : {}),
      });
    }
  }
  for (const item of items) {
    if (!seen.has(item.id)) {
      out.push({ id: item.id, span: clampSpan(item.defaultSpan ?? MIN_SPAN) });
    }
  }
  return out;
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function contains(rect: Rect, x: number, y: number) {
  return (
    x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
  );
}

/* -------------------------------------------------------------------------- */
/*                               Spring physics                               */
/* -------------------------------------------------------------------------- */

interface SpringConfig {
  k: number;
  c: number;
}

const spring = (k: number, zeta: number): SpringConfig => ({
  k,
  c: 2 * Math.sqrt(k) * zeta,
});

const MOVE_SPRING = spring(420, 0.76);
const LIFT_SPRING = spring(520, 0.82);
const TILT_SPRING = spring(260, 0.6);
const STEP = 1 / 120;

interface Body {
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  sx: number;
  sy: number;
  vsx: number;
  vsy: number;
  lift: number;
  vlift: number;
  liftTarget: number;
  rx: number;
  ry: number;
  vrx: number;
  vry: number;
  /** Smoothed pointer velocity (px/ms) while pinned to the pointer. */
  pvx: number;
  pvy: number;
  /** Seconds to wait before springing home (distance stagger). */
  hold: number;
  /** Follows the pointer directly instead of springing home. */
  pinned: boolean;
}

function createBody(): Body {
  return {
    ox: 0,
    oy: 0,
    vx: 0,
    vy: 0,
    sx: 1,
    sy: 1,
    vsx: 0,
    vsy: 0,
    lift: 0,
    vlift: 0,
    liftTarget: 0,
    rx: 0,
    ry: 0,
    vrx: 0,
    vry: 0,
    pvx: 0,
    pvy: 0,
    hold: 0,
    pinned: false,
  };
}

/** One semi-implicit Euler step; returns [position, velocity]. */
function integrate(
  x: number,
  v: number,
  target: number,
  cfg: SpringConfig,
  dt: number
): [number, number] {
  const a = -cfg.k * (x - target) - cfg.c * v;
  const nv = v + a * dt;
  return [x + nv * dt, nv];
}

const clampTilt = (v: number) => Math.max(-MAX_TILT, Math.min(MAX_TILT, v));

function stepBody(b: Body, dt: number) {
  // Lean toward the drag direction: right edge dips when moving right.
  const tiltY = b.pinned ? clampTilt(b.pvx * 9) : 0;
  const tiltX = b.pinned ? clampTilt(-b.pvy * 9) : 0;
  [b.ry, b.vry] = integrate(b.ry, b.vry, tiltY, TILT_SPRING, dt);
  [b.rx, b.vrx] = integrate(b.rx, b.vrx, tiltX, TILT_SPRING, dt);
  [b.lift, b.vlift] = integrate(b.lift, b.vlift, b.liftTarget, LIFT_SPRING, dt);
  // Pointer velocity decays when the pointer rests, so the tilt settles.
  b.pvx *= Math.exp(-dt * 10);
  b.pvy *= Math.exp(-dt * 10);
  if (b.hold > 0) {
    b.hold -= dt;
    return;
  }
  if (!b.pinned) {
    [b.ox, b.vx] = integrate(b.ox, b.vx, 0, MOVE_SPRING, dt);
    [b.oy, b.vy] = integrate(b.oy, b.vy, 0, MOVE_SPRING, dt);
  }
  [b.sx, b.vsx] = integrate(b.sx, b.vsx, 1, MOVE_SPRING, dt);
  [b.sy, b.vsy] = integrate(b.sy, b.vsy, 1, MOVE_SPRING, dt);
}

const near = (x: number, v: number, target: number, eps: number) =>
  Math.abs(x - target) < eps && Math.abs(v) < eps * 10;

function isSettled(b: Body) {
  if (b.pinned || b.hold > 0) {
    return false;
  }
  return (
    near(b.ox, b.vx, 0, 0.2) &&
    near(b.oy, b.vy, 0, 0.2) &&
    near(b.sx, b.vsx, 1, 0.001) &&
    near(b.sy, b.vsy, 1, 0.001) &&
    near(b.lift, b.vlift, b.liftTarget, 0.002) &&
    near(b.rx, b.vrx, 0, 0.02) &&
    near(b.ry, b.vry, 0, 0.02)
  );
}

function snapBody(b: Body) {
  if (!b.pinned) {
    b.ox = 0;
    b.oy = 0;
  }
  b.vx = 0;
  b.vy = 0;
  b.sx = 1;
  b.sy = 1;
  b.vsx = 0;
  b.vsy = 0;
  b.lift = b.liftTarget;
  b.vlift = 0;
  b.rx = 0;
  b.ry = 0;
  b.vrx = 0;
  b.vry = 0;
  b.hold = 0;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Owns every cell's spring state and writes transforms straight to the DOM,
 * so React never re-renders per frame. The loop sleeps once all is settled.
 */
class GridEngine {
  bodies = new Map<string, Body>();
  els = new Map<string, HTMLElement>();
  reduced = false;
  private raf = 0;
  private last = 0;

  body(id: string) {
    let b = this.bodies.get(id);
    if (!b) {
      b = createBody();
      this.bodies.set(id, b);
    }
    return b;
  }

  kick() {
    if (this.raf || typeof window === "undefined") {
      return;
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  write(id: string, b: Body) {
    const el = this.els.get(id);
    if (!el) {
      return;
    }
    const surface = el.firstElementChild as HTMLElement | null;
    const shadow = surface?.firstElementChild as HTMLElement | null;
    const atRest =
      b.ox === 0 && b.oy === 0 && b.lift === 0 && b.rx === 0 && b.ry === 0;
    el.style.transform = atRest
      ? ""
      : `translate3d(${r2(b.ox)}px, ${r2(b.oy)}px, ${r2(b.lift * LIFT_Z)}px) rotateX(${r2(b.rx)}deg) rotateY(${r2(b.ry)}deg)`;
    if (surface) {
      surface.style.transform =
        b.sx === 1 && b.sy === 1 ? "" : `scale(${r3(b.sx)}, ${r3(b.sy)})`;
    }
    if (shadow) {
      shadow.style.opacity = String(r2(Math.max(0, Math.min(1, b.lift))));
    }
  }

  private advance(b: Body, elapsed: number) {
    if (this.reduced) {
      snapBody(b);
      return false;
    }
    let t = elapsed;
    while (t > 0) {
      const dt = Math.min(STEP, t);
      stepBody(b, dt);
      t -= dt;
    }
    if (isSettled(b)) {
      snapBody(b);
      return false;
    }
    return true;
  }

  private readonly tick = (now: number) => {
    const elapsed = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    let active = false;
    for (const [id, b] of this.bodies) {
      active = this.advance(b, elapsed) || active;
      this.write(id, b);
    }
    this.raf = active ? requestAnimationFrame(this.tick) : 0;
  };
}

/* -------------------------------------------------------------------------- */
/*                                    Cell                                    */
/* -------------------------------------------------------------------------- */

const TONE_CLASS: Record<WidgetTone, string> = {
  surface: "bg-rp-surface",
  ink: "bg-rp-ink",
  green: "bg-rp-green",
  mustard: "bg-rp-mustard",
  rust: "bg-rp-rust",
};
const TONE_HOVER: Record<WidgetTone, string> = {
  surface: "hover:bg-rp-inset",
  ink: "hover:bg-rp-on-ink/15",
  green: "hover:bg-rp-paper/20",
  mustard: "hover:bg-rp-on-mustard/15",
  rust: "hover:bg-rp-paper/20",
};
const TONE_TEXT: Record<WidgetTone, string> = {
  surface: "text-rp-ink",
  ink: "text-rp-on-ink",
  green: "text-rp-paper",
  mustard: "text-rp-on-mustard",
  rust: "text-rp-paper",
};

interface CellProps {
  item: WidgetGridItem;
  span: number;
  /** Height set by resizing, in rows. */
  rowsSet?: number;
  narrow: boolean;
  lifted: boolean;
  dimmed: boolean;
  editing: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onHide: () => void;
  instructionsId: string;
  cellRef: (el: HTMLDivElement | null) => void;
  gripRef: (el: HTMLButtonElement | null) => void;
  onPressStart: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onGripPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onGripKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onGripBlur: () => void;
  onResizePointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onHover: (on: boolean) => void;
  onFocusChange: (on: boolean) => void;
}

function WidgetCell({
  item,
  span,
  rowsSet,
  narrow,
  lifted,
  dimmed,
  editing,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onHide,
  instructionsId,
  cellRef,
  gripRef,
  onPressStart,
  onGripPointerDown,
  onGripKeyDown,
  onGripBlur,
  onResizePointerDown,
  onResizeKeyDown,
  onHover,
  onFocusChange,
}: CellProps) {
  const size = sizeForSpan(span, narrow);
  const columns = narrow ? NARROW_COLUMNS : COLUMNS;
  const shownSpan = narrow ? narrowSpan(span) : span;

  const handleFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (e.target.matches(":focus-visible")) {
      onFocusChange(true);
    }
  };
  const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      onFocusChange(false);
    }
  };
  // Long-pressing with a finger would otherwise open the system menu.
  const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    const native = e.nativeEvent as globalThis.PointerEvent;
    if (lifted || native.pointerType === "touch") {
      e.preventDefault();
    }
  };

  const tone = item.tone ?? "surface";
  const wideRows = typeof item.rows === "function" ? item.rows(span) : (item.rows ?? 1);
  const rows = rowsSet ?? (narrow ? (item.narrowRows ?? wideRows) : wideRows);
  const filled = tone !== "surface";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: long press is a pointer shortcut; the grip button is the accessible control.
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: long press is a pointer shortcut; the grip button is the accessible control.
    <div
      className={cn(
        "group/cell relative select-none [-webkit-touch-callout:none]",
        "transition-opacity duration-200 ease-out",
        dimmed && "opacity-45",
        lifted && "z-sticky"
      )}
      data-lifted={lifted || undefined}
      onBlur={handleBlur}
      onContextMenu={handleContextMenu}
      onFocus={handleFocus}
      onPointerDown={onPressStart}
      onPointerEnter={(e) => e.pointerType === "mouse" && onHover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onHover(false)}
      ref={cellRef}
      style={
        {
          gridColumn: `span ${shownSpan} / span ${shownSpan}`,
          gridRow: `span ${rows} / span ${rows}`,
        } as CSSProperties
      }
    >
      {/* Surface: scaled by the engine while a resize settles. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 origin-top-left rounded-rp-card rp-shadow-rest",
          TONE_CLASS[tone]
        )}
      >
        {/* Lift shadow, faded in by the engine. */}
        <div className="absolute inset-0 rounded-rp-card opacity-0 rp-shadow-float" />
      </div>

      <div className={cn("relative flex h-full flex-col px-5 pt-2 pb-5", TONE_TEXT[tone])}>
        <div className="mb-1 flex h-11 shrink-0 items-center gap-2">
          <span aria-hidden className={cn(filled ? "opacity-80" : "text-rp-muted")}>
            {item.icon}
          </span>
          <span className={cn("truncate font-medium text-sm", filled ? "opacity-90" : "text-rp-muted")}>
            {item.title}
          </span>
          <div className="-mr-3 ml-auto flex items-center">
            {editing ? (
              <>
                {[
                  { label: `Move ${item.title} up`, icon: ArrowUp, off: !canMoveUp, run: onMoveUp },
                  { label: `Move ${item.title} down`, icon: ArrowDown, off: !canMoveDown, run: onMoveDown },
                  { label: `Hide ${item.title}`, icon: EyeSlash, off: false, run: onHide },
                ].map(({ label, icon: Glyph, off, run }) => (
                  <button
                    aria-label={label}
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-30",
                      filled ? TONE_HOVER[tone] : "text-rp-ink hover:bg-rp-inset"
                    )}
                    data-no-press
                    disabled={off}
                    key={label}
                    onClick={run}
                    type="button"
                  >
                    <Glyph aria-hidden size={18} />
                  </button>
                ))}
              </>
            ) : null}
            {item.onOpen && !editing ? (
              <button
                aria-label={item.openLabel ?? `Open ${item.title}`}
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted",
                  filled ? TONE_HOVER[tone] : "text-rp-muted hover:bg-rp-inset hover:text-rp-ink"
                )}
                data-no-press
                onClick={item.onOpen}
                type="button"
              >
                <ArrowUpRight aria-hidden size={18} />
              </button>
            ) : null}
            <button
              aria-describedby={instructionsId}
              aria-label={`Move ${item.title} (${SIZE_LABEL[size]})`}
              aria-pressed={lifted}
              className={cn(
                "flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-full outline-none",
                "transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-rp-muted",
                filled ? TONE_HOVER[tone] : "text-rp-muted hover:bg-rp-inset hover:text-rp-ink",
                lifted && "cursor-grabbing bg-rp-inset text-rp-ink"
              )}
              data-no-press
              onBlur={onGripBlur}
              onKeyDown={onGripKeyDown}
              onPointerDown={onGripPointerDown}
              ref={gripRef}
              type="button"
            >
              <DotsSixVertical aria-hidden size={18} />
            </button>
          </div>
        </div>

        <div className={cn("relative min-h-0 flex-1", item.flush && "-mx-5")} data-no-press={item.interactive ? "" : undefined}>
          <AnimatePresence initial={false}>
            <motion.div
              animate={{ opacity: 1 }}
              className="absolute inset-0 overflow-hidden"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={size}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              {item.render(size)}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {(
        <button
          aria-label={`Resize ${item.title}, ${narrow ? "" : `${shownSpan} of ${columns} columns, `}${rows} ${rows === 1 ? "row" : "rows"} high`}
          className={cn(
            "absolute right-0 bottom-0 flex size-11 cursor-nwse-resize touch-none items-end justify-end rounded-br-rp-card p-3 outline-none",
            "opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/cell:opacity-100 [@media(hover:none)]:opacity-60",
            "focus-visible:ring-2 focus-visible:ring-rp-muted",
            filled ? "text-current" : "text-rp-muted hover:text-rp-ink"
          )}
          data-no-press
          onKeyDown={onResizeKeyDown}
          onPointerDown={onResizePointerDown}
          type="button"
        >
          <svg aria-hidden="true" className="size-2.5" fill="none" viewBox="0 0 10 10">
            <circle cx="8.5" cy="3.5" fill="currentColor" r="1.1" />
            <circle cx="6" cy="6" fill="currentColor" r="1.1" />
            <circle cx="3.5" cy="8.5" fill="currentColor" r="1.1" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Widget Grid                                */
/* -------------------------------------------------------------------------- */

export function WidgetGrid({
  items,
  layout,
  defaultLayout,
  onLayoutChange,
  editing = false,
  onMoveItem,
  onHideItem,
  className,
  rowHeight = 168,
}: WidgetGridProps) {
  const instructionsId = useId();
  const [innerLayout, setInnerLayout] = useState<WidgetLayoutItem[]>(() =>
    normalizeLayout(defaultLayout ?? [], items)
  );
  const current = useMemo(
    () => normalizeLayout(layout ?? innerLayout, items),
    [layout, innerLayout, items]
  );
  const layoutKey = current.map((c) => `${c.id}:${c.span}`).join("|");
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );

  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < NARROW_BELOW);
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  // Last cell hovered or keyboard-focused (kept from upstream; it no longer dims the others).
  const [, setPointedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const wrapRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GridEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new GridEngine();
  }
  const engine = engineRef.current;
  const rectsRef = useRef(new Map<string, Rect>());
  const gripsRef = useRef(new Map<string, HTMLButtonElement>());
  const pendingFlipRef = useRef<{
    prev: Map<string, Rect>;
    movedId: string;
  } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pressRef = useRef<PressState | null>(null);
  const resizeIdRef = useRef<string | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; span: number; rows: number } | null>(null);
  const rowHeightRef = useRef(rowHeight);
  rowHeightRef.current = rowHeight;
  const reorderingRef = useRef(false);
  const narrowRef = useRef(false);
  const layoutRef = useRef(current);
  layoutRef.current = current;
  const latest = useRef({ layout, onLayoutChange, itemsById });
  latest.current = { layout, onLayoutChange, itemsById };
  // Stable handles to handlers that are declared further down.
  const cancelPressRef = useRef<() => void>(() => undefined);
  const endDragRef = useRef<(cancel: boolean) => void>(() => undefined);

  const titleOf = useCallback(
    (id: string) => latest.current.itemsById.get(id)?.title ?? id,
    []
  );

  const announce = useCallback((text: string) => {
    // A trailing space makes a repeated message read again.
    setMessage((prev) => (prev === text ? `${text} ` : text));
  }, []);

  const positionText = useCallback((id: string) => {
    const list = layoutRef.current;
    const index = list.findIndex((c) => c.id === id);
    return `position ${index + 1} of ${list.length}`;
  }, []);

  const commit = useCallback((next: WidgetLayoutItem[], movedId: string) => {
    pendingFlipRef.current = { prev: new Map(rectsRef.current), movedId };
    layoutRef.current = next;
    if (latest.current.layout === undefined) {
      setInnerLayout(next);
    }
    latest.current.onLayoutChange?.(next);
  }, []);

  /* ------------------------------ measuring ------------------------------ */

  // offset* ignore transforms, so these are the cells' resting slots.
  const measure = useCallback(() => {
    const next = new Map<string, Rect>();
    for (const [id, el] of engine.els) {
      next.set(id, {
        x: el.offsetLeft,
        y: el.offsetTop,
        w: el.offsetWidth,
        h: el.offsetHeight,
      });
    }
    rectsRef.current = next;
    return next;
  }, [engine]);

  const toGrid = useCallback((clientX: number, clientY: number) => {
    const box = gridRef.current?.getBoundingClientRect();
    return { x: clientX - (box?.left ?? 0), y: clientY - (box?.top ?? 0) };
  }, []);

  /** Keeps a pointer-held cell under the pointer, even after its slot moved. */
  const placeDragged = useCallback(() => {
    const drag = dragRef.current;
    const rect = drag ? rectsRef.current.get(drag.id) : undefined;
    if (!(drag && rect) || drag.mode !== "pointer") {
      return;
    }
    const p = toGrid(drag.lastX, drag.lastY);
    const b = engine.body(drag.id);
    b.ox = p.x - drag.grabX - rect.x;
    b.oy = p.y - drag.grabY - rect.y;
    engine.write(drag.id, b);
    engine.kick();
  }, [engine, toGrid]);

  /** FLIP: start every moved cell where it was drawn, then spring it home. */
  const flip = useCallback(
    (prev: Map<string, Rect>, next: Map<string, Rect>, movedId: string) => {
      const origin = next.get(movedId);
      const cx = origin ? origin.x + origin.w / 2 : 0;
      const cy = origin ? origin.y + origin.h / 2 : 0;
      const pinnedId =
        dragRef.current?.mode === "pointer" ? dragRef.current.id : null;
      for (const [id, n] of next) {
        const p = prev.get(id);
        if (!p || id === pinnedId) {
          continue;
        }
        const b = engine.body(id);
        const moved =
          Math.abs(p.x - n.x) > 0.5 || Math.abs(p.y - n.y) > 0.5 || p.w !== n.w;
        b.ox += p.x - n.x;
        b.oy += p.y - n.y;
        b.sx = (p.w * b.sx) / n.w;
        b.sy = (p.h * b.sy) / n.h;
        if (moved && id !== movedId) {
          // Nearer neighbours leave first, so the shuffle ripples outward.
          const dist = Math.hypot(n.x + n.w / 2 - cx, n.y + n.h / 2 - cy);
          b.hold = Math.min(0.1, dist * 0.000_16);
        }
        engine.write(id, b);
      }
      engine.kick();
    },
    [engine]
  );

  // After every layout change: measure, FLIP neighbours, re-seat the held cell.
  // biome-ignore lint/correctness/useExhaustiveDependencies: layoutKey and narrow are the triggers.
  useLayoutEffect(() => {
    const next = measure();
    const pending = pendingFlipRef.current;
    pendingFlipRef.current = null;
    if (pending) {
      flip(pending.prev, next, pending.movedId);
    }
    placeDragged();
    const drag = dragRef.current;
    if (drag?.mode === "keyboard") {
      // React may move the focused node when it reorders; keep focus on it.
      const grip = gripsRef.current.get(drag.id);
      if (grip && document.activeElement !== grip) {
        grip.focus({ preventScroll: true });
      }
    }
    reorderingRef.current = false;
  }, [layoutKey, narrow, measure, flip, placeDragged]);

  // Container width decides the 2- or 6-column layout; re-measure on resize.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }
    const ro = new ResizeObserver(() => {
      const isNarrow = wrap.clientWidth < NARROW_BELOW;
      narrowRef.current = isNarrow;
      setNarrow(isNarrow);
      measure();
      placeDragged();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [measure, placeDragged]);

  // Reduced motion is read after mount, so it never changes the first render.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      engine.reduced = mq.matches;
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [engine]);

  /* ------------------------------ pointer drag ---------------------------- */

  const hitTest = useCallback(
    (x: number, y: number) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      // Ignore the cell just swapped with until the pointer leaves it, so
      // cells of different widths don't flip back and forth.
      if (drag.skipId) {
        const skipRect = rectsRef.current.get(drag.skipId);
        if (skipRect && contains(skipRect, x, y)) {
          return;
        }
        drag.skipId = null;
      }
      const list = layoutRef.current;
      const from = list.findIndex((c) => c.id === drag.id);
      const to = list.findIndex((c) => {
        const rect = rectsRef.current.get(c.id);
        return c.id !== drag.id && rect !== undefined && contains(rect, x, y);
      });
      if (to < 0) {
        return;
      }
      drag.skipId = list[to].id;
      commit(moveItem(list, from, to), drag.id);
      announce(
        `${titleOf(drag.id)} moved to position ${to + 1} of ${list.length}.`
      );
    },
    [announce, commit, titleOf]
  );

  const onDragMove = useCallback(
    (e: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.mode !== "pointer" || e.pointerId !== drag.pointerId) {
        return;
      }
      const now = performance.now();
      const dt = Math.max(1, now - drag.lastT);
      const b = engine.body(drag.id);
      b.pvx += ((e.clientX - drag.lastX) / dt - b.pvx) * 0.35;
      b.pvy += ((e.clientY - drag.lastY) / dt - b.pvy) * 0.35;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      drag.lastT = now;
      placeDragged();
      const p = toGrid(e.clientX, e.clientY);
      hitTest(p.x, p.y);
    },
    [engine, hitTest, placeDragged, toGrid]
  );

  const onDragUp = useCallback((e: globalThis.PointerEvent) => {
    if (e.pointerId === dragRef.current?.pointerId) {
      endDragRef.current(false);
    }
  }, []);
  const onDragKey = useCallback((e: globalThis.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      endDragRef.current(true);
    }
  }, []);

  const removeDragListeners = useCallback(() => {
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragUp);
    window.removeEventListener("pointercancel", onDragUp);
    window.removeEventListener("keydown", onDragKey);
  }, [onDragKey, onDragMove, onDragUp]);

  const endDrag = useCallback(
    (cancel: boolean) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      removeDragListeners();
      const b = engine.body(drag.id);
      if (drag.mode === "pointer") {
        // Carry some of the throw into the settle spring.
        b.vx = b.pvx * 400;
        b.vy = b.pvy * 400;
      }
      b.pinned = false;
      b.liftTarget = 0;
      dragRef.current = null;
      if (cancel) {
        commit(drag.snapshot, drag.id);
      }
      engine.kick();
      setLiftedId(null);
      const title = titleOf(drag.id);
      if (cancel) {
        const index = drag.snapshot.findIndex((c) => c.id === drag.id);
        announce(
          `Move cancelled. ${title} returned to position ${index + 1} of ${drag.snapshot.length}.`
        );
      } else {
        announce(`${title} dropped at ${positionText(drag.id)}.`);
      }
    },
    [announce, commit, engine, positionText, removeDragListeners, titleOf]
  );
  endDragRef.current = endDrag;

  const liftPointer = useCallback(
    (id: string, pointerId: number, clientX: number, clientY: number) => {
      const rect = rectsRef.current.get(id);
      if (!rect || dragRef.current) {
        return;
      }
      const b = engine.body(id);
      const p = toGrid(clientX, clientY);
      dragRef.current = {
        id,
        mode: "pointer",
        pointerId,
        grabX: p.x - (rect.x + b.ox),
        grabY: p.y - (rect.y + b.oy),
        lastX: clientX,
        lastY: clientY,
        lastT: performance.now(),
        skipId: null,
        snapshot: layoutRef.current,
      };
      Object.assign(b, { pinned: true, hold: 0, vx: 0, vy: 0, pvx: 0, pvy: 0 });
      b.liftTarget = 1;
      engine.kick();
      setLiftedId(id);
      announce(`${titleOf(id)} lifted, ${positionText(id)}.`);
      navigator.vibrate?.(8);
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragUp);
      window.addEventListener("pointercancel", onDragUp);
      window.addEventListener("keydown", onDragKey);
    },
    [
      announce,
      engine,
      onDragKey,
      onDragMove,
      onDragUp,
      positionText,
      titleOf,
      toGrid,
    ]
  );

  /* ------------------------------ long press ------------------------------ */

  const onPressMove = useCallback((e: globalThis.PointerEvent) => {
    const press = pressRef.current;
    if (!press || e.pointerId !== press.pointerId) {
      return;
    }
    press.x = e.clientX;
    press.y = e.clientY;
    // Moving first means scrolling (touch) or selecting (mouse), not lifting.
    if (
      Math.hypot(e.clientX - press.startX, e.clientY - press.startY) >
      PRESS_SLOP
    ) {
      cancelPressRef.current();
    }
  }, []);

  const cancelPress = useCallback(() => {
    const press = pressRef.current;
    if (press) {
      window.clearTimeout(press.timer);
    }
    pressRef.current = null;
    window.removeEventListener("pointermove", onPressMove);
    window.removeEventListener("pointerup", cancelPressRef.current);
    window.removeEventListener("pointercancel", cancelPressRef.current);
  }, [onPressMove]);
  cancelPressRef.current = cancelPress;

  const startPress = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, id: string) => {
      const target = e.target as HTMLElement;
      if (
        dragRef.current ||
        resizeIdRef.current ||
        e.button !== 0 ||
        target.closest("[data-no-press]")
      ) {
        return;
      }
      cancelPress();
      pressRef.current = {
        id,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        timer: window.setTimeout(() => {
          const press = pressRef.current;
          cancelPressRef.current();
          if (press) {
            liftPointer(press.id, press.pointerId, press.x, press.y);
          }
        }, LONG_PRESS_MS),
      };
      window.addEventListener("pointermove", onPressMove);
      window.addEventListener("pointerup", cancelPress);
      window.addEventListener("pointercancel", cancelPress);
    },
    [cancelPress, liftPointer, onPressMove]
  );

  // A non-passive touchmove listener stops the page scrolling while a cell is
  // held. Until the long press fires, touch scrolling is left alone.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }
    const block = (e: TouchEvent) => {
      if (dragRef.current?.mode === "pointer" || resizeIdRef.current) {
        e.preventDefault();
      }
    };
    grid.addEventListener("touchmove", block, { passive: false });
    return () => grid.removeEventListener("touchmove", block);
  }, []);

  /* -------------------------------- resize -------------------------------- */

  const sizeText = useCallback((span: number, rows: number) => {
    const isNarrow = narrowRef.current;
    const high = `${rows} ${rows === 1 ? "row" : "rows"} high`;
    if (isNarrow) {
      return high;
    }
    return `${span} of ${COLUMNS} columns, ${SIZE_LABEL[sizeForSpan(span, false)]}, ${high}`;
  }, []);

  /** The height an entry shows: what was set, else the widget's own. */
  const rowsOf = useCallback((entry: WidgetLayoutItem) => {
    if (entry.rows) {
      return entry.rows;
    }
    const item = latest.current.itemsById.get(entry.id);
    const wide = typeof item?.rows === "function" ? item.rows(entry.span) : (item?.rows ?? 1);
    return narrowRef.current ? (item?.narrowRows ?? wide) : wide;
  }, []);

  const applySize = useCallback(
    (id: string, span: number, rows: number) => {
      const list = layoutRef.current;
      const entry = list.find((c) => c.id === id);
      if (!entry || (entry.span === span && rowsOf(entry) === rows)) {
        return;
      }
      commit(
        list.map((c) => (c.id === id ? { ...c, span, rows } : c)),
        id
      );
      announce(`${titleOf(id)} resized to ${sizeText(span, rows)}.`);
    },
    [announce, commit, rowsOf, sizeText, titleOf]
  );

  /**
   * Width and height from how far the handle moved since the press, each on its own axis: whole
   * columns across, whole rows down. Using the delta (not the cell's edges) keeps it stable when
   * the cell wraps rows. A narrow grid has one column, so only the height changes.
   */
  const sizeFromPointer = useCallback((clientX: number, clientY: number) => {
    const start = resizeStartRef.current;
    const grid = gridRef.current;
    if (!(start && grid)) {
      return null;
    }
    const isNarrow = narrowRef.current;
    const colW = (grid.clientWidth + GAP) / COLUMNS;
    const rowH = rowHeightRef.current + GAP;
    return {
      span: isNarrow ? start.span : clampSpan(start.span + Math.round((clientX - start.x) / colW)),
      rows: clampRows(start.rows + Math.round((clientY - start.y) / rowH)),
    };
  }, []);

  const onResizeMove = useCallback(
    (e: globalThis.PointerEvent) => {
      const id = resizeIdRef.current;
      const size = sizeFromPointer(e.clientX, e.clientY);
      if (id && size) {
        applySize(id, size.span, size.rows);
      }
    },
    [applySize, sizeFromPointer]
  );

  const onResizeUp = useCallback(() => {
    resizeIdRef.current = null;
    setResizingId(null);
    window.removeEventListener("pointermove", onResizeMove);
    window.removeEventListener("pointerup", onResizeUp);
    window.removeEventListener("pointercancel", onResizeUp);
  }, [onResizeMove]);

  const startResize = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, id: string) => {
      if (dragRef.current || e.button !== 0) {
        return;
      }
      e.preventDefault();
      cancelPress();
      resizeIdRef.current = id;
      const entry = layoutRef.current.find((c) => c.id === id);
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        span: entry?.span ?? MIN_SPAN,
        rows: entry ? rowsOf(entry) : 1,
      };
      setResizingId(id);
      window.addEventListener("pointermove", onResizeMove);
      window.addEventListener("pointerup", onResizeUp);
      window.addEventListener("pointercancel", onResizeUp);
    },
    [cancelPress, onResizeMove, onResizeUp, rowsOf]
  );

  /** Left and right change the width, up and down the height. */
  const onResizeKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
      const entry = layoutRef.current.find((c) => c.id === id);
      const wide = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      const high = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (!entry || (wide === 0 && high === 0)) {
        return;
      }
      e.preventDefault();
      if (narrowRef.current && wide !== 0) {
        return;
      }
      applySize(id, clampSpan(entry.span + wide), clampRows(rowsOf(entry) + high));
    },
    [applySize, rowsOf]
  );

  /* ------------------------------- keyboard ------------------------------- */

  /** Index of the closest cell in the row above or below. */
  const verticalNeighbor = useCallback((id: string, up: boolean) => {
    const list = layoutRef.current;
    const rects = rectsRef.current;
    const cur = rects.get(id);
    let best = -1;
    let bestDy = Number.POSITIVE_INFINITY;
    let bestDx = Number.POSITIVE_INFINITY;
    if (!cur) {
      return best;
    }
    const cx = cur.x + cur.w / 2;
    for (const [i, c] of list.entries()) {
      const r = rects.get(c.id);
      const inRow =
        r !== undefined &&
        (up ? r.y + r.h <= cur.y + 1 : r.y >= cur.y + cur.h - 1);
      if (r && inRow) {
        const dy = Math.abs(r.y - cur.y);
        const dx = Math.abs(r.x + r.w / 2 - cx);
        if (dy < bestDy - 1 || (Math.abs(dy - bestDy) <= 1 && dx < bestDx)) {
          best = i;
          bestDy = dy;
          bestDx = dx;
        }
      }
    }
    return best;
  }, []);

  const neighborIndex = useCallback(
    (id: string, key: string) => {
      const list = layoutRef.current;
      const index = list.findIndex((c) => c.id === id);
      if (key === "ArrowLeft") {
        return Math.max(0, index - 1);
      }
      if (key === "ArrowRight") {
        return Math.min(list.length - 1, index + 1);
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        const found = verticalNeighbor(id, key === "ArrowUp");
        return found < 0 ? index : found;
      }
      return null;
    },
    [verticalNeighbor]
  );

  const liftKeyboard = useCallback(
    (id: string) => {
      dragRef.current = {
        id,
        mode: "keyboard",
        pointerId: -1,
        grabX: 0,
        grabY: 0,
        lastX: 0,
        lastY: 0,
        lastT: 0,
        skipId: null,
        snapshot: layoutRef.current,
      };
      engine.body(id).liftTarget = 1;
      engine.kick();
      setLiftedId(id);
      announce(
        `${titleOf(id)} lifted, ${positionText(id)}. Arrow keys move it, Space drops it, Escape cancels.`
      );
    },
    [announce, engine, positionText, titleOf]
  );

  const moveByKey = useCallback(
    (id: string, key: string) => {
      const to = neighborIndex(id, key);
      if (to === null) {
        return false;
      }
      const list = layoutRef.current;
      const from = list.findIndex((c) => c.id === id);
      if (to === from) {
        announce(`${titleOf(id)} is at ${positionText(id)}.`);
        return true;
      }
      reorderingRef.current = true;
      commit(moveItem(list, from, to), id);
      announce(`${titleOf(id)} moved to position ${to + 1} of ${list.length}.`);
      return true;
    },
    [announce, commit, neighborIndex, positionText, titleOf]
  );

  const onGripKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
      const drag = dragRef.current;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (drag?.id === id) {
          endDrag(false);
        } else if (!drag) {
          liftKeyboard(id);
        }
        return;
      }
      if (drag?.id !== id || drag.mode !== "keyboard") {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        reorderingRef.current = true;
        endDrag(true);
        return;
      }
      if (moveByKey(id, e.key)) {
        e.preventDefault();
      }
    },
    [endDrag, liftKeyboard, moveByKey]
  );

  const onGripBlur = useCallback(
    (id: string) => {
      const drag = dragRef.current;
      if (
        drag?.mode === "keyboard" &&
        drag.id === id &&
        !reorderingRef.current
      ) {
        endDrag(false);
      }
    },
    [endDrag]
  );

  // Clean up timers, listeners and the loop on unmount.
  useEffect(
    () => () => {
      cancelPressRef.current();
      removeDragListeners();
      onResizeUp();
      engine.stop();
    },
    [engine, onResizeUp, removeDragListeners]
  );

  // Upstream also dims the others while one is hovered; on a dashboard that is noise, so only a lift or a resize does.
  const activeId = liftedId ?? resizingId;
  const columnCount = narrow ? NARROW_COLUMNS : COLUMNS;

  // While a cell is held or resized, a dot sits at every gutter crossing
  // so the slots it can land in read like a cutting mat.
  const showSlots = liftedId !== null || resizingId !== null;
  const [slotRows, setSlotRows] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the row count is measured, and changes with the layout and column count.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!(showSlots && grid)) {
      return;
    }
    setSlotRows(
      Math.max(1, Math.round((grid.offsetHeight + GAP) / (rowHeight + GAP)))
    );
  }, [showSlots, layoutKey, narrow, rowHeight]);
  const slotDots: ReactNode[] = [];
  if (showSlots && slotRows > 0) {
    for (let col = 0; col <= columnCount; col++) {
      for (let row = 0; row <= slotRows; row++) {
        slotDots.push(
          <circle
            cx={`${(col / columnCount) * 100}%`}
            cy={`${(row / slotRows) * 100}%`}
            fill="currentColor"
            key={`${col}:${row}`}
            r={1.5}
          />
        );
      }
    }
  }

  return (
    <div
      className={cn(
        "w-full",
        className
      )}
      ref={wrapRef}
    >
      <div
        className="relative grid grid-flow-row-dense [perspective:1400px]"
        ref={gridRef}
        style={{
          gap: GAP,
          gridAutoRows: rowHeight,
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        }}
      >
        {slotDots.length > 0 && (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute overflow-visible text-rp-muted/50"
            style={{
              top: -GAP / 2,
              left: -GAP / 2,
              width: `calc(100% + ${GAP}px)`,
              height: `calc(100% + ${GAP}px)`,
            }}
          >
            {slotDots}
          </svg>
        )}
        {current.map((entry, index) => {
          const item = itemsById.get(entry.id);
          if (!item) {
            return null;
          }
          const id = entry.id;
          return (
            <WidgetCell
              cellRef={(el) => {
                if (el) {
                  engine.els.set(id, el);
                } else {
                  engine.els.delete(id);
                }
              }}
              canMoveDown={index < current.length - 1}
              canMoveUp={index > 0}
              dimmed={activeId !== null && activeId !== id}
              editing={editing}
              onHide={() => onHideItem?.(id)}
              onMoveDown={() => onMoveItem?.(id, 1)}
              onMoveUp={() => onMoveItem?.(id, -1)}
              gripRef={(el) => {
                if (el) {
                  gripsRef.current.set(id, el);
                } else {
                  gripsRef.current.delete(id);
                }
              }}
              instructionsId={instructionsId}
              item={item}
              key={id}
              lifted={liftedId === id}
              narrow={narrow}
              onFocusChange={(on) =>
                setPointedId((prev) => {
                  if (on) {
                    return id;
                  }
                  return prev === id ? null : prev;
                })
              }
              onGripBlur={() => onGripBlur(id)}
              onGripKeyDown={(e) => onGripKeyDown(e, id)}
              onGripPointerDown={(e) => {
                if (e.button === 0) {
                  e.preventDefault();
                  cancelPress();
                  liftPointer(id, e.pointerId, e.clientX, e.clientY);
                }
              }}
              onHover={(on) =>
                setPointedId((prev) => {
                  if (on) {
                    return id;
                  }
                  return prev === id ? null : prev;
                })
              }
              onPressStart={(e) => startPress(e, id)}
              onResizeKeyDown={(e) => onResizeKeyDown(e, id)}
              onResizePointerDown={(e) => startResize(e, id)}
              rowsSet={entry.rows}
              span={entry.span}
            />
          );
        })}
      </div>
      <p className="sr-only" id={instructionsId}>
        Press Space to pick up. Use the arrow keys to move, Space to drop and
        Escape to cancel. With a pointer, press and hold a widget, then drag it.
      </p>
      <p aria-live="assertive" className="sr-only">
        {message}
      </p>
    </div>
  );
}
