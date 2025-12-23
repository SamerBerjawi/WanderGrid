
import React, { ReactNode, useState, useEffect, useRef, forwardRef } from 'react';

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
      "relative flex flex-col bg-white/60 dark:bg-gray-900/60 backdrop-blur-2xl border border-white/50 dark:border-white/5 shadow-xl rounded-[2rem] overflow-hidden transition-all duration-300",
      className
    )} 
    {...props}
  >
    {(title || action) && (
      <div className="px-6 py-5 border-b border-gray-100/50 dark:border-white/5 flex justify-between items-center bg-white/40 dark:bg-white/5">
        <div className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">{title}</div>
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
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20 border border-transparent dark:bg-blue-600 dark:hover:bg-blue-50 dark:shadow-blue-900/20",
    secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 shadow-sm dark:bg-gray-800 dark:text-gray-200 dark:border-white/10 dark:hover:bg-gray-700",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100/50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20 dark:hover:bg-red-500/20",
    outline: "bg-transparent border-2 border-gray-200 text-gray-600 hover:border-gray-300 dark:border-white/10 dark:text-gray-300 dark:hover:border-white/20"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs rounded-xl",
    md: "px-5 py-2.5 text-sm rounded-2xl",
    lg: "px-6 py-3 text-base rounded-2xl"
  };

  return (
    <button 
      ref={ref}
      className={cn(
        "flex items-center justify-center gap-2 font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
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
    {label && <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1">{label}</label>}
    <div className="relative group">
      <input
        ref={ref}
        className={cn(
          "w-full px-4 py-3 rounded-2xl bg-gray-50/50 border border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none text-gray-800 placeholder-gray-400 dark:bg-gray-800/40 dark:border-white/10 dark:text-gray-100 dark:focus:bg-gray-800 dark:focus:border-blue-500 dark:placeholder-gray-600",
          error && "border-red-500 focus:border-red-500 focus:ring-red-500/10",
          className
        )}
        {...props}
      />
      {rightElement && <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightElement}</div>}
    </div>
    {error && <p className="text-xs text-red-500 ml-1 font-medium">{error}</p>}
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
      
      onChange(`${String(newH).padStart(2, '0')}:${minuteStr}`);
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = parseInt(e.target.value);
      if (isNaN(val)) return;
      if (val < 1) val = 1;
      if (val > 12) val = 12;
      
      let newH = val;
      if (isPm && newH !== 12) newH += 12;
      if (!isPm && newH === 12) newH = 0;
      
      onChange(`${String(newH).padStart(2, '0')}:${minuteStr}`);
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = parseInt(e.target.value);
      if (isNaN(val)) return; 
      if (val < 0) val = 0;
      if (val > 59) val = 59;
      onChange(`${hourStr}:${String(val).padStart(2, '0')}`);
  };

  return (
      <div className={cn("flex flex-col gap-1.5 w-full", className)}>
          {label && <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1">{label}</label>}
          <div className="flex gap-2 h-[50px]">
              <div className="relative w-20 h-full">
                  <input
                      type="number"
                      min="1"
                      max="12"
                      className="w-full h-full px-2 rounded-2xl bg-gray-50/50 border border-gray-200 focus:bg-white focus:border-blue-500 outline-none text-center font-bold text-gray-800 dark:bg-gray-800/40 dark:border-white/10 dark:text-gray-100"
                      value={displayHour}
                      onChange={handleHourChange}
                  />
                  <span className="absolute top-1/2 -right-2.5 -translate-y-1/2 font-black text-gray-300 dark:text-gray-600">:</span>
              </div>
              <div className="relative w-20 h-full">
                  <input
                      type="number"
                      min="0"
                      max="59"
                      className="w-full h-full px-2 rounded-2xl bg-gray-50/50 border border-gray-200 focus:bg-white focus:border-blue-500 outline-none text-center font-bold text-gray-800 dark:bg-gray-800/40 dark:border-white/10 dark:text-gray-100"
                      value={minuteStr}
                      onChange={handleMinuteChange}
                  />
              </div>
              <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 border border-gray-200 dark:border-white/5 flex-1 h-full">
                  <button
                      onClick={() => handlePeriodChange('AM')}
                      className={cn("flex-1 rounded-xl text-xs font-bold transition-all h-full", !isPm ? "bg-white shadow text-blue-600 dark:bg-gray-700 dark:text-white" : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300")}
                  >AM</button>
                  <button
                      onClick={() => handlePeriodChange('PM')}
                      className={cn("flex-1 rounded-xl text-xs font-bold transition-all h-full", isPm ? "bg-white shadow text-blue-600 dark:bg-gray-700 dark:text-white" : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300")}
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
    {label && <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1">{label}</label>}
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "w-full px-4 py-3 rounded-2xl bg-gray-50/50 border border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none text-gray-800 appearance-none dark:bg-gray-800/40 dark:border-white/10 dark:text-gray-100 dark:focus:bg-gray-800 dark:focus:border-blue-500 cursor-pointer",
          error && "border-red-500",
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </div>
    </div>
    {error && <p className="text-xs text-red-500 ml-1 font-medium">{error}</p>}
  </div>
));
Select.displayName = "Select";

// --- Modal ---
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string; // New prop for custom width
}
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setVisible(false), 300);
      document.body.style.overflow = 'unset';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!visible && !isOpen) return null;

  return (
    <div className={cn("fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300", isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
      <div className="absolute inset-0 bg-gray-900/40 dark:bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className={cn(
          "relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-2xl rounded-[2rem] w-full overflow-hidden transform transition-all duration-300 max-h-[90vh] flex flex-col",
          maxWidth,
          isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-8'
        )}>
        <div className="px-6 py-5 border-b border-gray-100/50 dark:border-white/10 flex justify-between items-center bg-gray-50/50 dark:bg-white/5 shrink-0">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white">{title}</h3>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200/50 dark:hover:bg-white/10 transition-colors text-gray-500 dark:text-gray-400">
                <span className="material-icons-outlined text-lg">close</span>
            </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">
            {children}
        </div>
      </div>
    </div>
  );
};

// --- Tabs ---
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
  <div className={cn("flex p-1.5 bg-gray-100/80 dark:bg-gray-800/60 rounded-2xl gap-1 border border-transparent dark:border-white/5", className)}>
    {tabs.map((tab) => {
      const isActive = activeTab === tab.id;
      return (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-300 outline-none focus:ring-2 focus:ring-blue-500/20",
            isActive 
              ? 'bg-white text-gray-900 shadow-md shadow-gray-200/50 dark:bg-gray-700 dark:text-white dark:shadow-none scale-[1.02]' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-white/5'
          )}
        >
          {tab.icon && <span>{tab.icon}</span>}
          {tab.label}
        </button>
      );
    })}
  </div>
);

// --- Badge ---
interface BadgeProps { 
  children: ReactNode; 
  color?: 'blue' | 'green' | 'amber' | 'gray' | 'purple' | 'red' | 'indigo' | 'pink' | 'teal' | 'cyan';
  className?: string;
}
export const Badge: React.FC<BadgeProps> = ({ children, color = 'blue', className }) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20',
    red: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20',
    purple: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20',
    gray: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20',
    pink: 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-500/10 dark:text-pink-300 dark:border-pink-500/20',
    teal: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/20',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/20',
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider", colors[color] || colors.blue, className)}>
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    if (val.length >= 2) {
      setIsLoading(true);
      timeoutRef.current = setTimeout(async () => {
        try {
           const results = await fetchSuggestions(val);
           if (results && results.length > 0) {
             setSuggestions(results);
             setIsOpen(true);
           } else {
             setIsOpen(false);
           }
        } catch (error) {
           console.error("Autocomplete error", error);
        } finally {
           setIsLoading(false);
        }
      }, 400); 
    } else {
      setIsOpen(false);
      setIsLoading(false);
    }
  };

  const handleSelect = (suggestion: string) => {
    onChange(suggestion);
    setIsOpen(false);
    setSuggestions([]);
  };

  return (
    <div className="flex flex-col gap-1.5 w-full relative" ref={wrapperRef}>
      {label && <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide ml-1">{label}</label>}
      <div className="relative group">
        <input
          className={cn(
            "w-full px-4 py-3 rounded-2xl bg-gray-50/50 border border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none text-gray-800 placeholder-gray-400 dark:bg-gray-800/40 dark:border-white/10 dark:text-gray-100 dark:focus:bg-gray-800 dark:focus:border-blue-500 dark:placeholder-gray-600",
            className
          )}
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          type="text"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>
      
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 min-w-full w-max max-w-[90vw] mt-2 bg-white/95 backdrop-blur-xl border border-white/20 shadow-2xl rounded-2xl overflow-hidden max-h-60 overflow-y-auto dark:bg-gray-900/95 dark:border-white/10 animate-fade-in left-0">
          {suggestions.map((item, index) => (
            <li 
              key={index} 
              onClick={() => handleSelect(item)}
              className="px-4 py-3 hover:bg-blue-50 cursor-pointer text-sm font-medium text-gray-700 border-b border-gray-50 last:border-0 transition-colors dark:text-gray-200 dark:border-white/5 dark:hover:bg-white/5 whitespace-nowrap"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
