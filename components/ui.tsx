import React, { ReactNode, useState, useEffect, useRef, forwardRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  CaretDown as ChevronDown, 
  X,
  Storefront,
  House,
  RoadHorizon,
  Train,
  Anchor,
  AirplaneTilt,
  Buildings,
  Globe,
  MapPin
} from '@phosphor-icons/react';
import { getLocationMetadata, detectCategoryFromLabel } from '../services/geocoding';
import {
  INPUT_BASE_STYLE,
  BTN_PRIMARY_STYLE,
  BTN_SECONDARY_STYLE,
  BTN_DANGER_STYLE,
  CARD_FILL_STYLE,
  CARD_ELEVATED_STYLE,
  HEADER_TITLE_STYLE,
  HEADER_SUBTITLE_STYLE,
  SECTION_LABEL_STYLE,
  CLOSE_BTN_STYLE,
  STATUS_PILL_STYLE,
  SEGMENTED_TAB_WRAPPER,
  SEGMENTED_TAB_ACTIVE,
  SEGMENTED_TAB_INACTIVE,
} from '../constants';
import Icon from './ui/Icon';
import GlassPanel from './glass/GlassPanel';
import GlassButton from './glass/GlassButton';
import GlassInput from './glass/GlassInput';
import GlassSelect from './glass/GlassSelect';
import { InlineSkeleton } from './skeletons/InlineSkeleton';

export { GlassPanel, GlassButton, GlassInput, GlassSelect, InlineSkeleton };

// --- Utils ---
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

// --- Card System ---
interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  action?: ReactNode;
  noPadding?: boolean;
}
export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, title, action, children, noPadding = false, ...props }, ref) => (
  <GlassPanel
    ref={ref}
    className={cn(
      "wg-glass-card flex flex-col h-full transition-all duration-300",
      className
    )}
    overrides={{ borderRadius: 28 }}
    padding="0px"
  >
    <div className="flex flex-col h-full w-full" {...props}>
      {(title || action) && (
        <div className="px-6 py-5 border-b border-black/10 dark:border-white/5 flex justify-between items-center bg-gradient-to-r from-primary-500/5 to-transparent shrink-0">
          <div className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">{title}</div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={cn("flex-1 min-h-0 flex flex-col w-full relative", !noPadding && "p-6")}>
        {children}
      </div>
    </div>
  </GlassPanel>
));
Card.displayName = "Card";

// --- Button ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'glass';
  color?: 'primary' | 'emerald' | 'blue' | 'sky' | 'amber' | 'rose' | 'indigo' | string;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  isLoading?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ children, variant = 'primary', color, size = 'md', className, icon, isLoading, disabled, ...props }, ref) => {
  return (
    <GlassButton
      ref={ref}
      variant={variant}
      color={color}
      size={size}
      className={className}
      icon={icon}
      isLoading={isLoading}
      disabled={disabled}
      {...props}
    >
      {children}
    </GlassButton>
  );
});
Button.displayName = "Button";

// --- Input ---
import { AccentColor } from './ui/DatePicker';
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftElement?: ReactNode;
  rightElement?: ReactNode;
  containerClassName?: string;
  accentColor?: AccentColor;
}
export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, className, leftElement, rightElement, containerClassName, accentColor, ...props }, ref) => (
  <GlassInput
    ref={ref}
    label={label}
    error={error}
    leftElement={leftElement}
    rightElement={rightElement}
    className={className}
    containerClassName={containerClassName}
    accentColor={accentColor}
    {...props}
  />
));
Input.displayName = "Input";

// --- Time Input (AM/PM) ---
interface TimeInputProps {
  label?: string;
  value: string; // HH:mm 24h format
  onChange: (value: string) => void;
  className?: string;
}

export const TimeInput: React.FC<TimeInputProps> = ({ label, value, onChange, className }) => {
  const [hourStr, minuteStr] = (value || '12:00').split(':');
  let hour = parseInt(hourStr);
  if (isNaN(hour)) hour = 12;

  const isPm = hour >= 12;
  const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);

  const togglePeriod = () => {
    let newH = displayHour;
    if (!isPm && newH !== 12) newH += 12;
    if (isPm && newH === 12) newH = 0;
    if (!isPm && newH === 12) newH = 12;

    onChange(`${String(newH).padStart(2, '0')}:${minuteStr || '00'}`);
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = parseInt(e.target.value);
    if (isNaN(val)) return;
    if (val < 1) val = 1;
    if (val > 12) val = 12;

    let newH = val;
    if (isPm && newH !== 12) newH += 12;
    if (!isPm && newH === 12) newH = 0;

    onChange(`${String(newH).padStart(2, '0')}:${minuteStr || '00'}`);
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = parseInt(e.target.value);
    if (isNaN(val)) return;
    if (val < 0) val = 0;
    if (val > 59) val = 59;
    onChange(`${hourStr || '12'}:${String(val).padStart(2, '0')}`);
  };

  return (
    <div className={cn("flex flex-col gap-1.5 w-fit shrink-0", className)}>
      {label && <label className={SECTION_LABEL_STYLE}>{label}</label>}
      <GlassPanel
        className="wg-glass-pill transition-all duration-180 ease-glass border-black/10 dark:border-white/10 min-h-[44px] h-11 w-[116px]"
        padding="0px"
        overrides={{ borderRadius: 20 }}
      >
        <div className="flex items-center justify-between min-h-[44px] h-11 px-2.5 w-full text-xs font-bold select-none">
          {/* Hours : Minutes */}
          <div className="flex items-center gap-0.5">
            <input
              type="number"
              min="1"
              max="12"
              data-no-spinner="true"
              className="w-6 bg-transparent text-center text-xs font-bold text-light-text dark:text-dark-text focus:outline-none no-spinners cursor-pointer p-0"
              value={String(displayHour).padStart(2, '0')}
              onChange={handleHourChange}
            />
            <span className="font-bold text-light-text-secondary/50 dark:text-dark-text-secondary/50 select-none">:</span>
            <input
              type="number"
              min="0"
              max="59"
              data-no-spinner="true"
              className="w-6 bg-transparent text-center text-xs font-bold text-light-text dark:text-dark-text focus:outline-none no-spinners cursor-pointer p-0"
              value={minuteStr || '00'}
              onChange={handleMinuteChange}
            />
          </div>

          {/* Single AM/PM Toggle Button showing only the selected period */}
          <button
            type="button"
            onClick={togglePeriod}
            className="px-2 py-1 rounded-xl text-3xs font-black uppercase tracking-wider transition-all cursor-pointer bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-primary-600 dark:text-primary-400 border border-primary-500/20 shadow-2xs hover:scale-105 active:scale-95 select-none"
            title={`Click to switch to ${isPm ? 'AM' : 'PM'}`}
            aria-label={`Toggle period, currently ${isPm ? 'PM' : 'AM'}`}
          >
            {isPm ? 'PM' : 'AM'}
          </button>
        </div>
      </GlassPanel>
    </div>
  );
};

// --- Select ---
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: { label: string; value: string }[];
  error?: string;
  leftElement?: ReactNode;
  containerClassName?: string;
}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, options, error, className, leftElement, containerClassName, children, ...props }, ref) => (
  <GlassSelect
    ref={ref}
    label={label}
    options={options}
    error={error}
    leftElement={leftElement}
    className={className}
    containerClassName={containerClassName}
    {...props}
  >
    {children}
  </GlassSelect>
));
Select.displayName = "Select";

// --- Modal ---
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  tag?: string;
  icon?: string;
  children: ReactNode;
  maxWidth?: string;
  footerActions?: ReactNode;
}
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  tag,
  icon,
  children,
  maxWidth = 'max-w-lg',
  footerActions
}) => {
  const [visible, setVisible] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setVisible(false), 250);
      document.body.style.overflow = 'unset';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    // Remember what had focus so we can restore it on close
    previouslyFocused.current = document.activeElement as HTMLElement;

    const container = modalRef.current;
    if (!container) return;

    const getFocusable = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => el.offsetParent !== null); // exclude hidden elements

    // Move initial focus into the modal if nothing inside already has it
    const focusables = getFocusable();
    if (focusables.length && !container.contains(document.activeElement)) {
      focusables[0].focus();
    }

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const els = getFocusable();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleTab);
    return () => {
      window.removeEventListener('keydown', handleTab);
      // Return focus to whatever triggered the modal
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!visible && !isOpen) return null;

  return createPortal(
    <div className={cn("fixed inset-0 z-modal flex items-center justify-center p-4 safe-top safe-bottom safe-x transition-all duration-300 font-sans", isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
      {/* 1. Backdrop Blur Overlay */}
      <div
        className="fixed inset-0 backdrop-blur-md bg-black/5 dark:bg-black/15 transition-all duration-300"
        onClick={onClose}
      />

      {/* 2. Elevated Liquid Glass Modal Container */}
      <GlassPanel
        ref={modalRef}
        className={cn(
          "wg-glass-card w-full shadow-2xl overflow-hidden transform transition-all duration-300 max-h-[calc(90dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex flex-col min-h-0 z-10",
          maxWidth,
          isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        )}
        padding="0px"
        overrides={{ borderRadius: 28 }}
      >
        <div className="flex flex-col h-full w-full overflow-hidden rounded-[28px] bg-white/90 dark:bg-dark-card/90 backdrop-blur-2xl">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-black/5 dark:border-white/10 flex items-center justify-between bg-gradient-to-r from-primary-500/5 to-transparent shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {icon && (
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white bg-primary-500 shrink-0 shadow-md transition-transform hover:scale-105">
                  <Icon className="text-2xl" name={icon} />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={HEADER_TITLE_STYLE}>{title}</h3>
                  {tag && (
                    <span className={STATUS_PILL_STYLE}>
                      {tag}
                    </span>
                  )}
                </div>
                {subtitle && (
                  <p className={HEADER_SUBTITLE_STYLE}>
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={CLOSE_BTN_STYLE}
              aria-label="Close dialog"
            >
              <Icon className="text-lg" name="close" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
            {children}
          </div>

          {/* Sticky Frosted Footer (optional) */}
          {footerActions && (
            <div
              className="p-4 sm:p-6 border-t border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/[0.04] backdrop-blur-md flex items-center justify-between gap-3 shrink-0"
            >
              {footerActions}
            </div>
          )}
        </div>
      </GlassPanel>
    </div>,
    document.body
  );
};

// --- Tabs (Segmented Switcher) ---
export type TabColor = 'primary' | 'amber' | 'blue' | 'emerald' | 'purple' | 'teal' | 'rose' | 'indigo' | 'cyan' | 'orange' | 'violet';

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  color?: TabColor;
}

const TAB_COLOR_STYLES: Record<string, { activeText: string; activeBg: string; activeBorder: string; activeShadow: string }> = {
  primary: {
    activeText: "text-primary-700 dark:text-primary-300",
    activeBg: "bg-primary-500/20 dark:bg-primary-500/30",
    activeBorder: "border-primary-500/40 dark:border-primary-400/50",
    activeShadow: "shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(99,102,241,0.25)]",
  },
  amber: {
    activeText: "text-amber-700 dark:text-amber-300",
    activeBg: "bg-amber-500/20 dark:bg-amber-500/30",
    activeBorder: "border-amber-500/40 dark:border-amber-400/50",
    activeShadow: "shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(245,158,11,0.25)]",
  },
  blue: {
    activeText: "text-blue-700 dark:text-blue-300",
    activeBg: "bg-blue-500/20 dark:bg-blue-500/30",
    activeBorder: "border-blue-500/40 dark:border-blue-400/50",
    activeShadow: "shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(59,130,246,0.25)]",
  },
  emerald: {
    activeText: "text-emerald-700 dark:text-emerald-300",
    activeBg: "bg-emerald-500/20 dark:bg-emerald-500/30",
    activeBorder: "border-emerald-500/40 dark:border-emerald-400/50",
    activeShadow: "shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(16,185,129,0.25)]",
  },
  purple: {
    activeText: "text-purple-700 dark:text-purple-300",
    activeBg: "bg-purple-500/20 dark:bg-purple-500/30",
    activeBorder: "border-purple-500/40 dark:border-purple-400/50",
    activeShadow: "shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(168,85,247,0.25)]",
  },
  teal: {
    activeText: "text-teal-700 dark:text-teal-300",
    activeBg: "bg-teal-500/20 dark:bg-teal-500/30",
    activeBorder: "border-teal-500/40 dark:border-teal-400/50",
    activeShadow: "shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(20,184,166,0.25)]",
  },
  rose: {
    activeText: "text-rose-700 dark:text-rose-300",
    activeBg: "bg-rose-500/20 dark:bg-rose-500/30",
    activeBorder: "border-rose-500/40 dark:border-rose-400/50",
    activeShadow: "shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(244,63,94,0.25)]",
  },
  indigo: {
    activeText: "text-indigo-700 dark:text-indigo-300",
    activeBg: "bg-indigo-500/20 dark:bg-indigo-500/30",
    activeBorder: "border-indigo-500/40 dark:border-indigo-400/50",
    activeShadow: "shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(99,102,241,0.25)]",
  },
  cyan: {
    activeText: "text-cyan-700 dark:text-cyan-300",
    activeBg: "bg-cyan-500/20 dark:bg-cyan-500/30",
    activeBorder: "border-cyan-500/40 dark:border-cyan-400/50",
    activeShadow: "shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(6,182,212,0.25)]",
  },
  orange: {
    activeText: "text-orange-700 dark:text-orange-300",
    activeBg: "bg-orange-500/20 dark:bg-orange-500/30",
    activeBorder: "border-orange-500/40 dark:border-orange-400/50",
    activeShadow: "shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(249,115,22,0.25)]",
  },
  violet: {
    activeText: "text-violet-700 dark:text-violet-300",
    activeBg: "bg-violet-500/20 dark:bg-violet-500/30",
    activeBorder: "border-violet-500/40 dark:border-violet-400/50",
    activeShadow: "shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_2px_10px_rgba(139,92,246,0.25)]",
  },
};

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, className }) => (
  <div className={cn("flex items-center justify-center sm:justify-start overflow-x-auto sm:overflow-visible no-scrollbar py-3 px-2 -my-3 -mx-2 shrink-0", className)}>
    <GlassPanel
      className="wg-glass-pill shadow-lg shadow-black/5 dark:shadow-black/25 shrink-0"
      padding="4px 6px"
      overrides={{ borderRadius: 9999 }}
    >
      <div className="flex gap-1 relative items-center">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const colorKey = tab.color || 'primary';
          const colorStyle = TAB_COLOR_STYLES[colorKey] || TAB_COLOR_STYLES.primary;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative isolate rounded-full text-xs font-bold transition-all duration-200 flex items-center justify-center cursor-pointer select-none active:scale-95 px-3.5 sm:px-5 py-2.5 min-h-[44px]",
                isActive
                  ? colorStyle.activeText
                  : "text-light-text-secondary dark:text-dark-text-secondary hover:text-light-text dark:hover:text-dark-text hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
              )}
            >
              {isActive && (
                <div
                  className={cn(
                    "absolute inset-0 rounded-full backdrop-blur-md border z-0 pointer-events-none",
                    colorStyle.activeBg,
                    colorStyle.activeBorder,
                    colorStyle.activeShadow
                  )}
                  style={{ WebkitBackdropFilter: 'blur(12px)' }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {tab.icon && <span className="shrink-0 transition-transform duration-200">{tab.icon}</span>}
                <span className="tracking-tight font-bold whitespace-nowrap">{tab.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </GlassPanel>
  </div>
);

// --- Badge (Status Pills) ---
interface BadgeProps {
  children: ReactNode;
  color?: 'blue' | 'green' | 'amber' | 'gray' | 'purple' | 'red' | 'indigo' | 'pink' | 'teal' | 'cyan' | 'primary';
  variant?: 'primary' | 'secondary' | 'outline';
  className?: string;
}
export const Badge: React.FC<BadgeProps> = ({ children, color = 'primary', className }) => {
  const colors = {
    primary: 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border-primary-500/20',
    blue: 'bg-semantic-blue/10 text-semantic-blue border-semantic-blue/20',
    green: 'bg-semantic-green/10 text-semantic-green border-semantic-green/20',
    amber: 'bg-semantic-yellow/15 text-amber-600 dark:text-semantic-yellow border-semantic-yellow/30',
    red: 'bg-semantic-red/10 text-semantic-red border-semantic-red/20',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    gray: 'bg-black/5 text-light-text-secondary dark:bg-white/5 dark:text-dark-text-secondary border-black/10 dark:border-white/5',
    indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    pink: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20',
    teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
    cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-bold border uppercase tracking-wider select-none", colors[color] || colors.primary, className)}>
      {children}
    </span>
  );
};

// --- Category Badge ---
export const CategoryBadge: React.FC<{ category?: string; className?: string }> = ({ category, className = '' }) => {
  if (!category) return null;
  const cat = category.toLowerCase();
  
  switch (cat) {
    case 'business':
      return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0", className)}>
          <Storefront className="text-xs shrink-0" weight="bold" />
          <span>Business</span>
        </span>
      );
    case 'building':
      return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0", className)}>
          <House className="text-xs shrink-0" weight="bold" />
          <span>Building</span>
        </span>
      );
    case 'street':
      return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0", className)}>
          <RoadHorizon className="text-xs shrink-0" weight="bold" />
          <span>Street</span>
        </span>
      );
    case 'station':
      return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0", className)}>
          <Train className="text-xs shrink-0" weight="bold" />
          <span>Station</span>
        </span>
      );
    case 'port':
      return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shrink-0", className)}>
          <Anchor className="text-xs shrink-0" weight="bold" />
          <span>Port</span>
        </span>
      );
    case 'airport':
      return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0", className)}>
          <AirplaneTilt className="text-xs shrink-0" weight="bold" />
          <span>Airport</span>
        </span>
      );
    case 'city':
      return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0", className)}>
          <Buildings className="text-xs shrink-0" weight="bold" />
          <span>City</span>
        </span>
      );
    case 'country':
      return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 shrink-0", className)}>
          <Globe className="text-xs shrink-0" weight="bold" />
          <span>Country</span>
        </span>
      );
    case 'region':
    case 'area':
    case 'poi':
    default:
      return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider bg-black/5 dark:bg-white/5 text-light-text-secondary dark:text-dark-text-secondary border border-black/10 dark:border-white/10 shrink-0", className)}>
          <MapPin className="text-xs shrink-0" weight="bold" />
          <span>{cat === 'region' ? 'Region' : cat === 'poi' ? 'Point' : 'Area'}</span>
        </span>
      );
  }
};

// --- Autocomplete ---
export interface AutocompleteItem {
  label: string;
  title?: string;
  subtitle?: string;
  category?: string;
}

interface AutocompleteProps {
  label?: string;
  value: string;
  onChange: (value: string, item?: AutocompleteItem) => void;
  /** Optional second argument streams progressively better suggestions (instant local tier first, then providers). */
  fetchSuggestions: (query: string, onPartial?: (suggestions: (string | AutocompleteItem)[]) => void) => Promise<(string | AutocompleteItem)[]>;
  placeholder?: string;
  className?: string;
}
export const Autocomplete: React.FC<AutocompleteProps> = ({
  label,
  value,
  onChange,
  fetchSuggestions,
  placeholder,
  className = '',
}) => {
  const [suggestions, setSuggestions] = useState<(string | AutocompleteItem)[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);
  const timeoutRef = useRef<any>(null);
  const latestQueryRef = useRef<string>('');
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const normalizedItems = useMemo<AutocompleteItem[]>(() => {
    return suggestions.map(item => {
      if (typeof item === 'string') {
        const meta = getLocationMetadata(item);
        const title = meta?.title || (item.includes(' - ') ? item.split(' - ')[1]?.split(',')[0] : item.split(',')[0]);
        const subtitle = meta?.subtitle || (item.includes(', ') ? item.substring(item.indexOf(', ') + 2) : undefined);
        const category = meta?.category || detectCategoryFromLabel(item);
        return {
          label: item,
          title: title || item,
          subtitle,
          category
        };
      }
      return item;
    });
  }, [suggestions]);

  const updateCoords = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const width = Math.max(rect.width, 240);
    let left = rect.left;
    left = Math.max(12, Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - width - 12, left));

    const dropdownHeight = dropdownRef.current?.offsetHeight || 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top: number;
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      top = Math.max(12, rect.top - dropdownHeight - 6);
    } else {
      top = rect.bottom + 6;
      if (top + dropdownHeight > window.innerHeight - 12) {
        top = Math.max(12, window.innerHeight - dropdownHeight - 12);
      }
    }

    setCoords({ top, left, width });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updateCoords();
    const handleScrollOrResize = () => {
      updateCoords();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        wrapperRef.current && !wrapperRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, updateCoords]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    setActiveIndex(-1);

    latestQueryRef.current = val;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (val.length >= 2) {
      setIsLoading(true);
      timeoutRef.current = setTimeout(async () => {
        try {
          const results = await fetchSuggestions(val, (partial) => {
            // Streamed updates: show whatever is best so far without waiting for the slowest provider
            if (latestQueryRef.current !== val || !partial || partial.length === 0) return;
            setSuggestions(partial);
            setIsOpen(true);
          });
          if (latestQueryRef.current !== val) return;

          if (results && results.length > 0) {
            setSuggestions(results);
            setIsOpen(true);
          } else {
            setIsOpen(false);
            setSuggestions([]);
          }
        } catch (error) {
          console.error("Autocomplete error", error);
        } finally {
          if (latestQueryRef.current === val) {
            setIsLoading(false);
          }
        }
      }, 120);
    } else {
      setIsOpen(false);
      setIsLoading(false);
      setSuggestions([]);
    }
  };

  const handleSelect = (item: AutocompleteItem) => {
    onChange(item.label, item);
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || normalizedItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % normalizedItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + normalizedItems.length) % normalizedItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < normalizedItems.length) {
        handleSelect(normalizedItems[activeIndex]);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 w-full relative" ref={wrapperRef}>
      {label && <label className={SECTION_LABEL_STYLE}>{label}</label>}
      <div className="relative group w-full">
        <GlassPanel
          className="wg-glass-pill w-full transition-all duration-180 ease-glass border-black/10 dark:border-white/10 group-focus-within:border-primary-500/60 min-h-[44px] h-11"
          padding="0px"
          overrides={{ borderRadius: 20 }}
        >
          <div className="flex items-center min-h-[44px] h-11 px-3.5 w-full relative">
            <input
              className={cn(
                "w-full bg-transparent text-xs font-bold text-light-text dark:text-dark-text placeholder-light-text-secondary/50 dark:placeholder-dark-text-secondary/50 focus:outline-none pr-6",
                className
              )}
              value={value}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              type="text"
            />
            {isLoading && (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
        </GlassPanel>
      </div>

      {isOpen && normalizedItems.length > 0 && coords && createPortal(
        <ul
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            width: coords.width,
            zIndex: 70, // z-popover
          }}
          className="z-popover min-w-full w-max max-w-[90vw] bg-white/95 dark:bg-dark-card/95 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl rounded-2xl overflow-hidden max-h-60 overflow-y-auto animate-fade-in p-1.5 custom-scrollbar flex flex-col gap-1"
        >
          {normalizedItems.map((item, index) => {
            const isSelected = index === activeIndex;
            return (
              <li
                key={index}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "px-3.5 py-2.5 cursor-pointer rounded-xl transition-all flex items-center justify-between gap-3 text-left",
                  isSelected
                    ? "bg-primary-500/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-300 shadow-xs"
                    : "text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5"
                )}
                title={item.label}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-bold truncate">
                    {item.title}
                  </span>
                  {item.subtitle && (
                    <span className="text-2xs text-light-text-secondary dark:text-dark-text-secondary truncate font-medium mt-0.5">
                      {item.subtitle}
                    </span>
                  )}
                </div>
                <CategoryBadge category={item.category} />
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </div>
  );
};

export { Icon } from './ui/Icon';
export { StandardDrawer } from './StandardDrawer';
export { BentoCard, BentoGrid } from './ui/bento-grid';
export { DateRangePicker } from './ui/DateRangePicker';
export { DatePicker } from './ui/DatePicker';
