/**
 * KokonutUI Morph Popover (registry slug `morph-popover`), ported for WanderGrid's New pages:
 * rp-* tokens, 44px, a single-line mode (`multiline={false}`, Enter submits), custom submit
 * labels and an optional footer hint. No demo "pretend send".
 *
 * @author: @dorianbaffier
 * @description: Morph Popover
 * @version: 1.0.0
 * @date: 2026-10-15
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 */

import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
  type Transition,
} from "motion/react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/utils/cn";

export interface MorphPopoverProps {
  /** The button's label, which slides up to become the panel's title. */
  label?: string;
  icon?: ReactNode;
  placeholder?: string;
  /** Shown in the small pill after sending. */
  sentLabel?: string;
  /** Called with the text. A promise keeps the panel in its sending state. */
  onSubmit?: (value: string) => void | Promise<void>;
  /** Which edge the panel grows from. */
  align?: "start" | "end";
  /** Panel width in px. */
  width?: number;
  /** A textarea (default) or a single-line field where Enter submits. */
  multiline?: boolean;
  /** Submit button label and its in-progress label. */
  submitLabel?: string;
  pendingLabel?: string;
  /** Replaces the keyboard-shortcut hint in the footer. */
  footerHint?: ReactNode;
  className?: string;
}

type Phase = "idle" | "open" | "sending" | "sent";

const MORPH: Transition = { type: "spring", duration: 0.42, bounce: 0.14 };
const FADE: Transition = { duration: 0.2, ease: [0.23, 1, 0.32, 1] };
const SENT_FOR = 1600;
const BUTTON_HEIGHT = 44;
const APPLE_PLATFORM = /Mac|iPhone|iPad/;
const isMac = () =>
  typeof navigator !== "undefined" && APPLE_PLATFORM.test(navigator.platform);

function ChatIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 16 16">
      <path
        d="M2.75 4.25a1.5 1.5 0 0 1 1.5-1.5h7.5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H7l-2.75 2.5v-2.5a1.5 1.5 0 0 1-1.5-1.5v-5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5 animate-spin motion-reduce:animate-none"
      fill="none"
      viewBox="0 0 16 16"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

/**
 * A button that grows into the small form it opens, and shrinks into a
 * confirmation once sent. The label travels with it and becomes the title.
 */
export default function MorphPopover({
  label = "Feedback",
  icon = <ChatIcon />,
  placeholder = "What would make this better?",
  sentLabel = "Thanks!",
  onSubmit = () => undefined,
  align = "start",
  width = 340,
  multiline = true,
  submitLabel = "Send",
  pendingLabel = "Sending",
  footerHint,
  className,
}: MorphPopoverProps) {
  const id = useId();
  const [phase, setPhase] = useState<Phase>("idle");
  const [value, setValue] = useState("");
  const [shortcut, setShortcut] = useState("Ctrl");
  const [size, setSize] = useState<{ idle: number; sent: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const idleSizer = useRef<HTMLSpanElement>(null);
  const sentSizer = useRef<HTMLSpanElement>(null);
  const wasOpen = useRef(false);
  const expanded = phase === "open" || phase === "sending";

  useEffect(() => {
    if (isMac()) {
      setShortcut("⌘");
    }
  }, []);

  // The closed shapes are as wide as their content, measured off-screen.
  useLayoutEffect(() => {
    const measure = () =>
      setSize({
        idle: idleSizer.current?.offsetWidth ?? 120,
        sent: sentSizer.current?.offsetWidth ?? 100,
      });
    measure();
    const observer = new ResizeObserver(measure);
    if (idleSizer.current) {
      observer.observe(idleSizer.current);
    }
    if (sentSizer.current) {
      observer.observe(sentSizer.current);
    }
    return () => observer.disconnect();
  }, []);

  // Focus follows the shape: into the field on open, back to the button after.
  useEffect(() => {
    if (phase === "open") {
      textareaRef.current?.focus({ preventScroll: true });
      wasOpen.current = true;
    } else if (phase === "idle" && wasOpen.current) {
      wasOpen.current = false;
      // Found by query: refs on AnimatePresence children trip React 19 warnings.
      rootRef.current
        ?.querySelector<HTMLButtonElement>("button[aria-haspopup]")
        ?.focus({ preventScroll: true });
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== "sent") {
      return;
    }
    const timer = window.setTimeout(() => setPhase("idle"), SENT_FOR);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "open") {
      return;
    }
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPhase("idle");
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [phase]);

  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const text = value.trim();
      if (!text || phase !== "open") {
        return;
      }
      setPhase("sending");
      try {
        await onSubmit(text);
        setValue("");
        setPhase("sent");
      } catch {
        setPhase("open");
      }
    },
    [onSubmit, phase, value]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && phase === "open") {
        event.stopPropagation();
        setPhase("idle");
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey || !multiline)) {
        event.preventDefault();
        submit();
      }
    },
    [phase, submit, multiline]
  );

  let target: { width: number | string; height: number | string };
  if (expanded) {
    target = { width, height: "auto" };
  } else if (phase === "sent") {
    target = { width: size?.sent ?? "auto", height: BUTTON_HEIGHT };
  } else {
    target = { width: size?.idle ?? "auto", height: BUTTON_HEIGHT };
  }

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id={id}>
        <div
          className={cn("relative inline-block align-top", className)}
          ref={rootRef}
          style={{ height: BUTTON_HEIGHT }}
        >
          {/* Off-screen copies that give the closed shapes their widths. */}
          <span
            aria-hidden="true"
            className="pointer-events-none invisible absolute flex items-center gap-2 whitespace-nowrap px-3.5 font-medium text-sm"
            ref={idleSizer}
          >
            <span className="size-4" />
            {label}
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none invisible absolute flex items-center gap-2 whitespace-nowrap px-3.5 font-medium text-sm"
            ref={sentSizer}
          >
            <span className="size-4" />
            {sentLabel}
          </span>
          {/* Keeps the inline box button-sized while the panel floats over the page. */}
          <span
            aria-hidden="true"
            className="invisible block"
            style={{ width: size?.idle ?? 120 }}
          />
          <motion.div
            animate={{
              ...target,
              borderRadius: expanded ? 16 : BUTTON_HEIGHT / 2,
            }}
            className={cn(
              "absolute top-0 z-popover overflow-hidden bg-rp-surface text-rp-ink",
              align === "start" ? "left-0" : "right-0",
              expanded
                ? "rp-shadow-float"
                : "rp-shadow-soft"
            )}
            initial={false}
            onKeyDown={handleKeyDown}
            transition={MORPH}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {phase === "idle" ? (
                <motion.button
                  animate={{ opacity: 1 }}
                  aria-expanded={false}
                  aria-haspopup="dialog"
                  className="flex h-11 items-center gap-2 whitespace-nowrap px-3.5 font-medium text-sm transition-colors duration-150 hover:bg-rp-inset focus-visible:outline-none active:bg-rp-inset "
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  initial={{ opacity: 0 }}
                  key="idle"
                  onClick={() => setPhase("open")}
                  transition={FADE}
                  type="button"
                >
                  <motion.span
                    className="text-rp-muted"
                    layoutId="icon"
                  >
                    {icon}
                  </motion.span>
                  <motion.span layoutId="label">{label}</motion.span>
                </motion.button>
              ) : null}

              {expanded ? (
                <motion.form
                  animate={{ opacity: 1 }}
                  aria-label={label}
                  className="flex flex-col"
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  initial={{ opacity: 0 }}
                  key="open"
                  onSubmit={submit}
                  style={{ width: width - 2 }}
                  transition={FADE}
                >
                  <div className="flex items-center gap-2 px-3.5 pt-2.5 font-medium text-sm">
                    <motion.span
                      className="text-rp-muted"
                      layoutId="icon"
                    >
                      {icon}
                    </motion.span>
                    <motion.span layoutId="label">{label}</motion.span>
                  </div>
                  <motion.div
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    className="flex flex-col"
                    initial={{ opacity: 0, y: 4, filter: "blur(4px)" }}
                    transition={{ ...FADE, delay: 0.08 }}
                  >
                    <label className="sr-only" htmlFor={`${id}-text`}>
                      {placeholder}
                    </label>
                    {multiline ? (
                      <textarea
                        className="h-28 w-full resize-none bg-transparent px-3.5 pt-2 text-sm text-rp-ink leading-relaxed outline-none placeholder:text-rp-muted disabled:opacity-60"
                        disabled={phase === "sending"}
                        id={`${id}-text`}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder={placeholder}
                        ref={textareaRef}
                        value={value}
                      />
                    ) : (
                      <input
                        autoComplete="off"
                        className="mx-3.5 mt-2 mb-3 min-h-11 rounded-rp-inset bg-rp-inset px-3 text-sm text-rp-ink outline-none placeholder:text-rp-muted focus-visible:ring-2 focus-visible:ring-rp-muted disabled:opacity-60"
                        disabled={phase === "sending"}
                        id={`${id}-text`}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder={placeholder}
                        ref={textareaRef}
                        type="text"
                        value={value}
                      />
                    )}
                    <div className="flex items-center justify-between gap-3 border-rp-line border-t bg-rp-inset/60 px-3 py-2">
                      {footerHint ? (
                        <span className="min-w-0 text-xs text-rp-muted">{footerHint}</span>
                      ) : (
                      <span className="flex items-center gap-1 text-xs text-rp-muted">
                        <kbd className="rounded border border-rp-line bg-rp-surface px-1 font-sans text-2xs text-rp-muted ">
                          {shortcut}
                        </kbd>
                        <kbd className="rounded border border-rp-line bg-rp-surface px-1 font-sans text-2xs text-rp-muted ">
                          ↵
                        </kbd>
                        <span className="ml-1">to send</span>
                      </span>
                      )}
                      <button
                        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-rp-ink px-4 font-medium text-rp-on-ink text-sm transition-colors duration-150 hover:bg-rp-ink/90 outline-none focus-visible:ring-2 focus-visible:ring-rp-muted disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!value.trim() || phase === "sending"}
                        type="submit"
                      >
                        {phase === "sending" ? <Spinner /> : null}
                        {phase === "sending" ? pendingLabel : submitLabel}
                      </button>
                    </div>
                  </motion.div>
                </motion.form>
              ) : null}

              {phase === "sent" ? (
                <motion.div
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  className="flex h-11 items-center gap-2 whitespace-nowrap px-3.5 font-medium text-sm"
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  initial={{ opacity: 0, filter: "blur(4px)" }}
                  key="sent"
                  role="status"
                  transition={{ ...FADE, delay: 0.1 }}
                >
                  <svg
                    aria-hidden="true"
                    className="size-4 text-rp-green"
                    fill="none"
                    viewBox="0 0 16 16"
                  >
                    <circle
                      cx="8"
                      cy="8"
                      fill="currentColor"
                      opacity="0.15"
                      r="8"
                    />
                    <motion.path
                      animate={{ pathLength: 1 }}
                      d="M4.75 8.25 7 10.5l4.25-4.75"
                      initial={{ pathLength: 0 }}
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.75"
                      transition={{
                        duration: 0.3,
                        ease: [0.23, 1, 0.32, 1],
                        delay: 0.2,
                      }}
                    />
                  </svg>
                  {sentLabel}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
