/**
 * KokonutUI Stack Panel (registry slug `stack-panel`), ported for WanderGrid's New pages: rp-* tokens,
 * Hugeicons adapter icons, no demo page, a `detail` that may be any node, rows that can be disabled.
 *
 * @author: @dorianbaffier
 * @description: Stack Panel
 * @version: 1.0.0
 * @date: 2026-10-16
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import {
  AnimatePresence,
  animate,
  MotionConfig,
  motion,
  type PanInfo,
  useAnimate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { Check, CaretLeft as ChevronLeft, CaretRight as ChevronRight, type Icon } from "../ui/hugeicons";
import { cn } from "../../utils/cn";

export interface StackRow {
  id: string;
  label: string;
  /** A leading 18px icon (UI_UX_DESIGN_REFERENCE.md §1.5). */
  icon?: Icon;
  /** Grey text on the right, like the current value of a setting. */
  detail?: ReactNode;
  /** Id of the page this row opens. */
  to?: string;
  /** Anything else on the right: a switch, a badge. */
  trailing?: ReactNode;
  onSelect?: () => void;
  /** Shows a check, for rows that pick one option of a section. */
  selected?: boolean;
  /** Shows a switch in this state, for rows that turn something on. */
  checked?: boolean;
  tone?: "default" | "danger";
  disabled?: boolean;
}

export interface StackSection {
  title?: string;
  rows: StackRow[];
  /** Small print under the section. */
  footer?: string;
}

export interface StackPage {
  title: string;
  sections: StackSection[];
}

export interface StackPanelProps {
  pages: Record<string, StackPage>;
  /** The page the panel starts on. */
  root: string;
  className?: string;
  /** Hides the header bar while the root page is showing; it appears for nested pages, with Back. */
  bare?: boolean;
}

// iOS pushes with a curve close to this; the page settles without bounce.
const PUSH = { type: "spring", duration: 0.42, bounce: 0 } as const;
const HEIGHT = { type: "spring", duration: 0.38, bounce: 0 } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// The page underneath moves a third as far as the one on top.
const PARALLAX = 0.3;
// Let go past this share of the width, or flick faster, and the page pops.
const POP_DISTANCE = 0.35;
const POP_VELOCITY = 500;

interface Origin {
  /** The tapped row's label, relative to the panel. */
  left: number;
  top: number;
  height: number;
  fontSize: number;
}

/**
 * The header title. Pushed in from a row, it flies from that row's label
 * up into the header; otherwise it slides a little and fades.
 */
function Title({
  text,
  origin,
  direction,
  panel,
}: {
  text: string;
  origin: Origin | null;
  direction: 1 | -1;
  panel: HTMLElement | null;
}) {
  const [scope, run] = useAnimate<HTMLSpanElement>();
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const el = scope.current;
    if (!(el && panel)) {
      return;
    }
    if (!origin || reduced) {
      run(
        el,
        { opacity: [0, 1], x: [direction * 24, 0] },
        { duration: reduced ? 0 : 0.28, ease: EASE_OUT }
      );
      return;
    }
    const box = panel.getBoundingClientRect();
    const own = el.getBoundingClientRect();
    const fontSize = Number.parseFloat(getComputedStyle(el).fontSize);
    const scale = origin.fontSize / fontSize;
    const dx = origin.left - (own.left - box.left);
    const dy =
      origin.top + origin.height / 2 - (own.top - box.top + own.height / 2);
    // Placed at the row before the first frame, so it never flashes in the
    // header first.
    el.style.transform = `translateX(${dx}px) translateY(${dy}px) scale(${scale})`;
    run(
      el,
      { x: [dx, 0], y: [dy, 0], scale: [scale, 1], opacity: [1, 1] },
      PUSH
    );
  }, [scope, run, origin, direction, panel, reduced]);

  return (
    <motion.span
      className="absolute inset-x-0 top-1/2 mx-auto w-fit max-w-[55%] -translate-y-1/2 truncate font-semibold text-[15px] text-rp-ink"
      exit={{
        opacity: 0,
        x: direction * -40,
        transition: { duration: 0.18, ease: EASE_OUT },
      }}
      ref={scope}
      style={{ transformOrigin: "left center" }}
    >
      {text}
    </motion.span>
  );
}

function Page({
  page,
  onOpen,
  measureRef,
}: {
  page: StackPage;
  onOpen: (row: StackRow, label: HTMLElement) => void;
  measureRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="flex flex-col gap-5 px-3 pt-2 pb-4" ref={measureRef}>
      {page.sections.map((section, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: sections are a fixed, ordered list
        <section key={index}>
          {section.title && (
            <h3 className="mb-1.5 px-3 font-medium text-xs text-rp-muted">
              {section.title}
            </h3>
          )}
          <ul className="divide-y divide-rp-line overflow-hidden rounded-rp-inset bg-rp-inset">
            {section.rows.map((row) => (
              <li key={row.id}>
                <RowView onOpen={onOpen} row={row} />
              </li>
            ))}
          </ul>
          {section.footer && (
            <p className="mt-1.5 px-3 text-xs text-rp-muted leading-5">
              {section.footer}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

function RowView({
  row,
  onOpen,
}: {
  row: StackRow;
  onOpen: (row: StackRow, label: HTMLElement) => void;
}) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const interactive = Boolean(row.to || row.onSelect);
  const RowIcon = row.icon;
  const content = (
    <>
      {RowIcon && (
        <RowIcon aria-hidden="true" className="shrink-0 text-rp-muted" size={18} />
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-left text-[15px]",
          row.tone === "danger"
            ? "text-rp-rust"
            : "text-rp-ink"
        )}
        ref={labelRef}
      >
        {row.label}
      </span>
      {row.detail && (
        <span className="max-w-[45%] shrink-0 truncate text-sm text-rp-muted">
          {row.detail}
        </span>
      )}
      {row.trailing}
      {row.checked !== undefined && <Toggle on={row.checked} />}
      {row.selected !== undefined && (
        <Check
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-rp-ink",
            !row.selected && "invisible"
          )}
        />
      )}
      {row.to && (
        <ChevronRight
          aria-hidden="true"
          className="-mr-1 size-4 shrink-0 text-rp-muted"
        />
      )}
    </>
  );
  const base = "flex min-h-11 w-full items-center gap-2 px-3 py-2";
  const off = row.disabled ? "pointer-events-none opacity-50" : "";
  if (!interactive) {
    return <div className={cn(base, off)}>{content}</div>;
  }
  const className = cn(
    base,
    off,
    "outline-none transition-colors duration-150 hover:bg-rp-line/60 focus-visible:bg-rp-line/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rp-muted active:bg-rp-line"
  );
  const onClick = () => {
    if (labelRef.current) {
      onOpen(row, labelRef.current);
    }
  };
  if (row.checked !== undefined) {
    return (
      <button
        aria-checked={row.checked}
        className={className}
        disabled={row.disabled}
        onClick={onClick}
        role="switch"
        type="button"
      >
        {content}
      </button>
    );
  }
  return (
    <button
      aria-pressed={row.selected}
      className={className}
      disabled={row.disabled}
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  );
}

/**
 * A panel that drills into pages, like settings on a phone. A row opens its
 * page from the right while its label flies up to become the title; swipe
 * the page right, or press Back or Escape, to return.
 */
export function StackPanel({ pages, root, className, bare }: StackPanelProps) {
  const [stack, setStack] = useState<string[]>([root]);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  // "auto" until the first page is measured, so the server render has a
  // height too.
  const [height, setHeight] = useState<number | "auto">("auto");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  // The top page's offset; the page underneath is derived from it, so a
  // push, a pop and a swipe all move both pages together.
  const x = useMotionValue(0);
  const [width, setWidth] = useState(360);
  const underX = useTransform(x, (v) => -PARALLAX * (width - v));
  const shade = useTransform(x, [0, width], [0.06, 0]);

  const top = stack.at(-1) ?? root;
  const under = stack.length > 1 ? stack.at(-2) : undefined;
  const parent = under ? pages[under] : undefined;

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    const watch = new ResizeObserver(() => setWidth(body.clientWidth));
    watch.observe(body);
    return () => {
      watch.disconnect();
      observer.current?.disconnect();
    };
  }, []);

  // The panel's height follows the page on top.
  const measure = (el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!el) {
      return;
    }
    observer.current = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.current.observe(el);
  };

  const push = (row: StackRow, label: HTMLElement) => {
    row.onSelect?.();
    if (!(row.to && pages[row.to]) || busy) {
      return;
    }
    const box = panelRef.current?.getBoundingClientRect();
    const rect = label.getBoundingClientRect();
    setOrigin(
      box
        ? {
            left: rect.left - box.left,
            top: rect.top - box.top,
            height: rect.height,
            fontSize: Number.parseFloat(getComputedStyle(label).fontSize),
          }
        : null
    );
    setDirection(1);
    setBusy(true);
    x.set(width);
    const to = row.to;
    flushSync(() => setStack((s) => [...s, to]));
    animate(x, 0, PUSH).then(() => setBusy(false));
    backRef.current?.focus({ preventScroll: true });
  };

  const pop = () => {
    if (stack.length < 2) {
      return;
    }
    setOrigin(null);
    setDirection(-1);
    setBusy(true);
    animate(x, width, { ...PUSH, duration: 0.34 }).then(() => {
      // Both in one frame: the old top unmounts as the offset resets.
      flushSync(() => setStack((s) => s.slice(0, -1)));
      x.set(0);
      setBusy(false);
    });
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (x.get() > width * POP_DISTANCE || info.velocity.x > POP_VELOCITY) {
      pop();
    } else {
      animate(x, 0, PUSH);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && stack.length > 1) {
      event.preventDefault();
      pop();
      backRef.current?.focus({ preventScroll: true });
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveElementInteractions: Escape is a shortcut for the Back button */}
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-rp-inset bg-rp-surface",
          className
        )}
        onKeyDown={onKeyDown}
        ref={panelRef}
      >
        {!(bare && stack.length < 2) && (
        <div className="relative z-raised flex h-12 items-center border-rp-line border-b bg-rp-surface px-2">
          <AnimatePresence initial={false}>
            {parent && (
              <motion.button
                animate={{ opacity: 1 }}
                className="relative z-raised flex max-w-[30%] items-center rounded-lg py-1.5 pr-2 pl-1 min-h-11 text-sm text-rp-muted outline-none transition-colors duration-150 hover:bg-rp-inset hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                key="back"
                onClick={pop}
                ref={backRef}
                transition={{ duration: 0.18 }}
                type="button"
              >
                <ChevronLeft aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{parent.title}</span>
              </motion.button>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            <Title
              direction={direction}
              key={`${top}-${stack.length}`}
              origin={origin}
              panel={panelRef.current}
              text={pages[top]?.title ?? ""}
            />
          </AnimatePresence>
        </div>
        )}

        <motion.div
          animate={{ height }}
          className="relative"
          ref={bodyRef}
          transition={HEIGHT}
        >
          {under && pages[under] && (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0"
              inert
              key={`${under}-${stack.length - 1}`}
              style={{ x: underX }}
            >
              <Page onOpen={() => undefined} page={pages[under]} />
              <motion.div
                className="absolute inset-0 bg-rp-ink"
                style={{ opacity: shade }}
              />
            </motion.div>
          )}
          {pages[top] && (
            <motion.div
              className={cn("relative bg-rp-surface", stack.length > 1 && "rp-shadow-float")}
              drag={stack.length > 1 && !busy ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragDirectionLock
              dragElastic={{ left: 0, right: 1 }}
              dragMomentum={false}
              key={`${top}-${stack.length}`}
              onDragEnd={onDragEnd}
              style={{ x }}
            >
              <Page measureRef={measure} onOpen={push} page={pages[top]} />
            </motion.div>
          )}
        </motion.div>
      </div>
    </MotionConfig>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative h-[22px] w-9 shrink-0 rounded-full transition-colors duration-200",
        on ? "bg-rp-green" : "bg-rp-line"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-[18px] rounded-full bg-rp-surface rp-shadow-raised transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
          on && "translate-x-3.5"
        )}
      />
    </span>
  );
}
