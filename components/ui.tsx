import React, { ReactNode, useState, useEffect, useRef, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
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

// --- Utils ---
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');

// --- Card System ---
interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  action?: ReactNode;
  noPadding?: boolean;
}
export const Card = forwardRef<HTMLDivElement, CardProps>(({ className, title, action, children, noPadding = false, ...props }, ref) => (
  <div 
    ref={ref}
    className={cn(
      "relative flex flex-col bg-white dark:bg-dark-card border border-black/5 dark:border-white/5 shadow-sm rounded-3xl overflow-hidden transition-all duration-300",
      className
    )} 
    {...props}
  >
    {(title || action) && (
      <div className="px-6 py-5 border-b border-black/5 dark:border-white/5 flex justify-between items-center bg-black/[0.02] dark:bg-white/[0.02]">
        <div className="text-base font-bold text-light-text dark:text-dark-text tracking-tight">{title}</div>
        {action && <div>{action}</div>}
      </div>
    )}
    <div className={cn("flex-1 min-h-0 flex flex-col w-full relative", !noPadding && "p-6")}>
      {children}
    </div>
  </div>
));
Card.displayName = "Card";

// --- Button ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  isLoading?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ children, variant = 'primary', size = 'md', className, icon, isLoading, disabled, ...props }, ref) => {
  const variants = {
    primary: BTN_PRIMARY_STYLE,
    secondary: BTN_SECONDARY_STYLE,
    ghost: "bg-transparent text-light-text-secondary dark:text-dark-text-secondary hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl transition-all font-bold active:scale-95",
    danger: BTN_DANGER_STYLE,
    outline: "bg-transparent border border-black/10 dark:border-white/10 text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl transition-all font-bold active:scale-95"
  };

  const sizes = {
    sm: "px-3.5 py-1.5 text-xs rounded-xl",
    md: "px-5 py-2.5 text-xs uppercase tracking-wider rounded-2xl",
    lg: "px-6 py-3 text-xs uppercase tracking-wider rounded-2xl"
  };

  return (
    <button 
      ref={ref}
      className={cn(
        "flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer select-none",
        variants[variant],
        sizes[size],
        className
      )} 
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : icon ? (
        <span className="flex items-center text-lg">{icon}</span>
      ) : null}
      {children}
    </button>
  );
});
Button.displayName = "Button";

// --- Input ---
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  rightElement?: ReactNode;
}
export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, className, rightElement, ...props }, ref) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className={SECTION_LABEL_STYLE}>{label}</label>}
    <div className="relative group">
      <input
        ref={ref}
        className={cn(
          INPUT_BASE_STYLE,
          "h-10 text-xs font-bold",
          error && "!border-rose-500 !ring-rose-500/20",
          className
        )}
        {...props}
      />
      {rightElement && <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">{rightElement}</div>}
    </div>
    {error && <p className="text-2xs text-rose-500 font-bold ml-1">{error}</p>}
  </div>
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
  
  const handlePeriodChange = (p: 'AM' | 'PM') => {
      let newH = displayHour;
      if (p === 'PM' && newH !== 12) newH += 12;
      if (p === 'AM' && newH === 12) newH = 0;
      if (p === 'PM' && newH === 12) newH = 12;
      
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
      <div className={cn("flex flex-col gap-1.5 w-full", className)}>
          {label && <label className={SECTION_LABEL_STYLE}>{label}</label>}
          <div className="flex gap-2 h-10">
              <div className="relative w-16 h-full">
                  <input
                      type="number"
                      min="1"
                      max="12"
                      className="w-full h-full px-2 rounded-2xl bg-white dark:bg-dark-card border border-black/5 dark:border-white/5 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 text-center text-xs font-bold text-light-text dark:text-dark-text"
                      value={displayHour}
                      onChange={handleHourChange}
                  />
                  <span className="absolute top-1/2 -right-2 -translate-y-1/2 font-bold text-light-text-secondary/40 dark:text-dark-text-secondary/40">:</span>
              </div>
              <div className="relative w-16 h-full">
                  <input
                      type="number"
                      min="0"
                      max="59"
                      className="w-full h-full px-2 rounded-2xl bg-white dark:bg-dark-card border border-black/5 dark:border-white/5 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 text-center text-xs font-bold text-light-text dark:text-dark-text"
                      value={minuteStr || '00'}
                      onChange={handleMinuteChange}
                  />
              </div>
              <div className={cn(SEGMENTED_TAB_WRAPPER, "!p-0.5 flex-1 h-full")}>
                  <button
                      type="button"
                      onClick={() => handlePeriodChange('AM')}
                      className={cn("flex-1 rounded-xl text-2xs font-bold uppercase tracking-wider transition-all h-full flex items-center justify-center", !isPm ? "bg-white dark:bg-dark-card text-primary-500 shadow-sm" : "text-light-text-secondary dark:text-dark-text-secondary opacity-60 hover:opacity-100")}
                  >AM</button>
                  <button
                      type="button"
                      onClick={() => handlePeriodChange('PM')}
                      className={cn("flex-1 rounded-xl text-2xs font-bold uppercase tracking-wider transition-all h-full flex items-center justify-center", isPm ? "bg-white dark:bg-dark-card text-primary-500 shadow-sm" : "text-light-text-secondary dark:text-dark-text-secondary opacity-60 hover:opacity-100")}
                  >PM</button>
              </div>
          </div>
      </div>
  );
};

// --- Select ---
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { label: string; value: string }[];
  error?: string;
}
export const Select = forwardRef<HTMLSelectElement, SelectProps>(({ label, options, error, className, ...props }, ref) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className={SECTION_LABEL_STYLE}>{label}</label>}
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          INPUT_BASE_STYLE,
          "h-10 text-xs font-bold appearance-none cursor-pointer pr-10",
          error && "!border-rose-500 !ring-rose-500/20",
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-white dark:bg-dark-card text-light-text dark:text-dark-text">{opt.label}</option>
        ))}
      </select>
      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-light-text-secondary dark:text-dark-text-secondary opacity-60">
        <ChevronDown className="w-4 h-4" />
      </div>
    </div>
    {error && <p className="text-2xs text-rose-500 font-bold ml-1">{error}</p>}
  </div>
));
Select.displayName = "Select";

// --- MultiSelect ---
interface MultiSelectProps {
  label?: string;
  options: { label: string; value: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({ label, options, value, onChange, placeholder = "Select...", className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()) || o.value.toLowerCase().includes(search.toLowerCase()));

  const toggleOption = (val: string) => {
    if (value.includes(val)) {
      onChange(value.filter(v => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  const selectedLabels = options.filter(o => value.includes(o.value)).map(o => o.label);
  const displayValue = selectedLabels.length === 0 ? placeholder : selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels.length} Selected`;

  return (
    <div className={cn("flex flex-col gap-1.5 w-full relative", className)} ref={wrapperRef}>
      {label && <label className={SECTION_LABEL_STYLE}>{label}</label>}
      <button 
        type="button"
        className={cn(INPUT_BASE_STYLE, "h-10 text-xs font-bold text-left flex items-center justify-between cursor-pointer")}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="truncate">{displayValue}</span>
        <ChevronDown className="w-4 h-4 text-light-text-secondary/60 dark:text-dark-text-secondary/60 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 w-full min-w-[220px] z-50 bg-white dark:bg-dark-card border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl p-2 animate-fade-in left-0">
          <input 
            type="text" 
            placeholder="Search options..." 
            autoFocus
            className={cn(INPUT_BASE_STYLE, "h-8 !text-xs mb-2")}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
            {filteredOptions.length > 0 ? filteredOptions.map(opt => (
              <label key={opt.value} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors">
                <input 
                  type="checkbox" 
                  checked={value.includes(opt.value)} 
                  onChange={() => toggleOption(opt.value)}
                  className="rounded border-black/10 text-primary-500 focus:ring-primary-500 cursor-pointer"
                />
                <span className="text-xs text-light-text dark:text-dark-text font-medium truncate">{opt.label}</span>
              </label>
            )) : (
              <div className="p-3 text-2xs font-bold uppercase tracking-wider text-light-text-secondary/50 dark:text-dark-text-secondary/50 text-center">No results found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

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
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 font-sans", isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
      {/* 1. Frosted Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
        style={{ WebkitBackdropFilter: 'blur(4px)' }}
        onClick={onClose} 
      />
      
      {/* 2. Elevated Glassmorphic Modal Container */}
      <div 
        className={cn(
          "relative bg-light-card/90 dark:bg-dark-card/90 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-2xl rounded-3xl w-full overflow-hidden transform transition-all duration-300 max-h-[90vh] flex flex-col z-10",
          maxWidth,
          isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        )}
        style={{ WebkitBackdropFilter: 'blur(24px)' }}
      >
        {/* Header */}
        <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-gradient-to-r from-primary-500/5 to-transparent shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-white bg-primary-500 shrink-0 shadow-md transition-transform hover:scale-105">
                <Icon className="text-2xl" name={icon}/>
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
            <Icon className="text-lg" name="close"/>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {children}
        </div>

        {/* Sticky Frosted Footer (optional) */}
        {footerActions && (
          <div 
            className="p-6 border-t border-black/5 dark:border-white/5 bg-light-card/80 dark:bg-dark-card/80 backdrop-blur-md flex items-center justify-between gap-3 shrink-0"
            style={{ WebkitBackdropFilter: 'blur(12px)' }}
          >
            {footerActions}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// --- Tabs (Segmented Switcher) ---
interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}
interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}
export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onChange, className }) => (
  <div className={cn(SEGMENTED_TAB_WRAPPER, className)}>
    {tabs.map((tab) => {
      const isActive = activeTab === tab.id;
      return (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex-1 flex items-center justify-center gap-2",
            isActive ? SEGMENTED_TAB_ACTIVE : SEGMENTED_TAB_INACTIVE
          )}
        >
          {tab.icon && <span>{tab.icon}</span>}
          <span>{tab.label}</span>
        </button>
      );
    })}
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
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    red: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    gray: 'bg-black/5 text-light-text-secondary dark:bg-white/5 dark:text-dark-text-secondary border-black/5 dark:border-white/5',
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

// --- Autocomplete ---
interface AutocompleteProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  fetchSuggestions: (query: string) => Promise<string[]>;
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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<any>(null);
  const latestQueryRef = useRef<string>('');

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
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
           const results = await fetchSuggestions(val);
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
      }, 350); 
    } else {
      setIsOpen(false);
      setIsLoading(false);
      setSuggestions([]);
    }
  };

  const handleSelect = (suggestion: string) => {
    onChange(suggestion);
    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        handleSelect(suggestions[activeIndex]);
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
      <div className="relative group">
        <input
          className={cn(
            INPUT_BASE_STYLE,
            "h-10 text-xs font-bold",
            className
          )}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          type="text"
        />
        {isLoading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>
      
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 min-w-full w-max max-w-[90vw] mt-2 bg-white dark:bg-dark-card border border-black/10 dark:border-white/10 shadow-2xl rounded-2xl overflow-hidden max-h-60 overflow-y-auto animate-fade-in left-0 p-1">
          {suggestions.map((item, index) => {
            const isSelected = index === activeIndex;
            return (
              <li 
                key={index} 
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "px-4 py-2.5 cursor-pointer text-xs font-bold rounded-xl transition-colors truncate max-w-[400px]",
                  isSelected 
                    ? "bg-primary-500 text-white" 
                    : "text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5"
                )}
                title={item}
              >
                {item}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export { Icon } from './ui/Icon';
export { StandardDrawer } from './StandardDrawer';
