/**
 * KokonutUI Smooth Drawer (registry slug `smooth-drawer`), ported for WanderGrid's New pages:
 * the checkout content is replaced by slots (title, description, a summary on the right, the primary
 * action and a details body); rp-* tokens; Vaul directly (no shadcn drawer wrapper); adapter icons.
 * The mechanics are kept: a bottom sheet on two snap points that peeks at the summary and the action,
 * and drags (or toggles) up to reveal the details, which track the drag.
 *
 * @author: @dorianbaffier
 * @description: Smooth Drawer
 * @version: 2.0.0
 * @date: 2026-10-16
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import { useReducedMotion } from "motion/react";
import {
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Drawer } from "vaul";
import { ArrowUp as ChevronUp } from "@/components/ui/hugeicons";
import { cn } from "@/utils/cn";
import { useSheetFlag } from "@/hooks/useOverlayA11y";

export interface SmoothDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** Shown on the right of the title, e.g. a count. */
  aside?: ReactNode;
  /** The primary action, shown in the peek. */
  action?: ReactNode;
  /** Label of the details toggle. */
  detailsLabel?: string;
  hideDetailsLabel?: string;
  /** Open straight to the details. */
  defaultExpanded?: boolean;
  /** The details, revealed when the sheet is expanded. */
  children?: ReactNode;
  /** Height of the peek, in px. */
  peekHeight?: number;
}

const MAX_SHEET_HEIGHT = 680;
const TOP_GAP = 24;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export default function SmoothDrawer({
  open,
  onOpenChange,
  title,
  description,
  aside,
  action,
  detailsLabel = "Show details",
  hideDetailsLabel = "Hide details",
  defaultExpanded = false,
  children,
  peekHeight = 220,
}: SmoothDrawerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [viewportHeight, setViewportHeight] = useState(0);
  const detailsRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const reduceMotion = useReducedMotion();
  useSheetFlag(open);

  useEffect(() => {
    const measure = () => setViewportHeight(window.innerHeight);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (open) {
      setExpanded(defaultExpanded);
    }
  }, [open, defaultExpanded]);

  // Vaul measures snap points from the top of the window, so the sheet is
  // given an explicit height and the peek point is offset by the gap above it.
  // Without details there is nothing to expand: one snap point, and the sheet is only as tall as its peek
  // (plus the home-bar inset). Used by the confirm dialog (components/ConfirmHost.tsx).
  const single = !children;
  const sheetHeight = single ? peekHeight : Math.max(peekHeight, Math.min(MAX_SHEET_HEIGHT, viewportHeight - TOP_GAP));
  const snapPoints = useMemo(
    () => (single ? [1] : [`${peekHeight + Math.max(0, viewportHeight - sheetHeight)}px`, 1]),
    [single, viewportHeight, sheetHeight, peekHeight]
  );

  const clearDragStyles = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const details = detailsRef.current;
    if (details) {
      details.style.transition = "";
      details.style.opacity = "";
      details.style.translate = "";
    }
  }, []);

  const setSnap = (next: boolean) => {
    clearDragStyles();
    setExpanded(next);
  };

  // While Vaul drags the sheet, the details track its position directly.
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const sheet = event.currentTarget;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const details = detailsRef.current;
      if (!(details && sheet.classList.contains("vaul-dragging"))) {
        return;
      }
      const peekTop = window.innerHeight - peekHeight;
      const fullTop = window.innerHeight - sheetHeight;
      const top = sheet.getBoundingClientRect().top;
      const progress = clamp01((peekTop - top) / (peekTop - fullTop || 1));
      details.style.transition = "none";
      details.style.opacity = String(progress);
      details.style.translate = reduceMotion ? "" : `0 ${Math.round((1 - progress) * 12)}px`;
    });
  };

  return (
    <Drawer.Root
      activeSnapPoint={snapPoints[expanded && !single ? 1 : 0]}
      fadeFromIndex={0}
      onOpenChange={onOpenChange}
      open={open}
      setActiveSnapPoint={(point) => setSnap(point === 1)}
      snapPoints={snapPoints}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="rp-root fixed inset-0 z-modal-backdrop bg-rp-canvas/50 backdrop-blur-xl" />
        <Drawer.Content
          aria-describedby={undefined}
          className="rp-root fixed inset-x-0 bottom-0 z-modal mx-auto flex w-full max-w-[440px] flex-col rounded-t-rp-card bg-rp-surface font-rp text-rp-ink outline-none rp-shadow-float"
          onPointerCancel={clearDragStyles}
          onPointerMove={handlePointerMove}
          onPointerUp={clearDragStyles}
          style={{ height: single ? `calc(${sheetHeight}px + env(safe-area-inset-bottom, 0px))` : sheetHeight }}
        >
          <div aria-hidden="true" className="flex h-6 shrink-0 items-center justify-center">
            <span className="h-1.5 w-10 rounded-full bg-rp-line" />
          </div>

          <div className={cn("shrink-0 px-5 pt-1", single && "pb-5")}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Drawer.Title className="font-medium text-lg text-rp-ink">{title}</Drawer.Title>
                {description ? <div className="mt-0.5 text-sm text-rp-muted">{description}</div> : null}
              </div>
              {aside ? <div className="shrink-0 text-right">{aside}</div> : null}
            </div>

            {action ? <div className="mt-4 flex justify-stretch [&>*]:w-full">{action}</div> : null}

            {children ? (
              <button
                aria-expanded={expanded}
                className="mt-1 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full text-sm text-rp-muted outline-none transition-colors duration-150 hover:text-rp-ink focus-visible:ring-2 focus-visible:ring-rp-muted"
                onClick={() => setSnap(!expanded)}
                type="button"
              >
                {expanded ? hideDetailsLabel : detailsLabel}
                <ChevronUp
                  aria-hidden="true"
                  size={14}
                  className={cn(
                    "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                    expanded && "rotate-180"
                  )}
                />
              </button>
            ) : null}
          </div>

          {children ? (
            <div
              className={cn(
                "custom-scrollbar min-h-0 flex-1 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]",
                "transition-[opacity,translate] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:translate-y-0",
                expanded ? "translate-y-0 overflow-y-auto opacity-100" : "translate-y-3 overflow-hidden opacity-0"
              )}
              data-vaul-no-drag
              inert={!expanded}
              ref={detailsRef}
            >
              <div className="border-rp-line border-t pt-4">{children}</div>
            </div>
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
