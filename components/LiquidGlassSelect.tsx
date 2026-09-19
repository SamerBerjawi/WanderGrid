import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import GlassPanel from './glass/GlassPanel';
import { CaretDown, Check, MagnifyingGlass, X } from '@phosphor-icons/react';

export interface SelectOption {
    value: string;
    label: string;
}

export interface LiquidGlassSelectProps {
    value: string;
    onChange: (val: string) => void;
    options: SelectOption[];
    placeholder: string;
    mobilePlaceholder?: string;
    icon?: React.ComponentType<{ className?: string; weight?: any }>;
    align?: 'left' | 'right' | 'center';
    searchable?: boolean;
    isMobile?: boolean;
    className?: string;
    fullWidth?: boolean;
}

export const LiquidGlassSelect: React.FC<LiquidGlassSelectProps> = ({
    value,
    onChange,
    options,
    placeholder,
    mobilePlaceholder,
    icon: IconComp,
    align = 'left',
    searchable = false,
    isMobile = false,
    className = '',
    fullWidth = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

    const updatePosition = () => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const popoverWidth = fullWidth 
            ? Math.max(rect.width, 240)
            : Math.min(260, typeof window !== 'undefined' ? window.innerWidth - 24 : 260);
        let left: number;
        if (align === 'right') {
            left = rect.right - popoverWidth;
        } else if (align === 'center') {
            left = rect.left + (rect.width / 2) - (popoverWidth / 2);
        } else {
            left = rect.left;
        }
        // Clamp strictly within viewport boundaries
        left = Math.max(12, Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - popoverWidth - 12, left));
        const top = rect.bottom + 8;
        setCoords({ top, left, width: popoverWidth });
    };

    const handleToggle = () => {
        if (!isOpen) {
            updatePosition();
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    };

    // Reposition on scroll / resize while open
    useEffect(() => {
        if (!isOpen) return;
        const handleScrollOrResize = () => {
            updatePosition();
        };
        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);
        return () => {
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [isOpen, align, fullWidth]);

    // Close on outside click or Escape
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                popoverRef.current && !popoverRef.current.contains(target) &&
                buttonRef.current && !buttonRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const selectedOption = options.find(o => o.value === value);
    const displayLabel = selectedOption 
        ? selectedOption.label 
        : (isMobile && mobilePlaceholder ? mobilePlaceholder : placeholder);

    const filteredOptions = useMemo(() => {
        if (!searchable || !search.trim()) return options;
        const q = search.toLowerCase();
        return options.filter(o => o.label.toLowerCase().includes(q));
    }, [options, search, searchable]);

    const isFull = fullWidth || isMobile;

    return (
        <div className={`relative ${isFull ? 'w-full' : 'w-auto shrink-0'} ${className}`}>
            {/* Trigger Button - Liquid-Glass Pill wrapped */}
            <GlassPanel
                className={`wg-glass-pill ${isFull ? 'w-full' : 'w-auto'} shrink-0`}
                padding="0px"
                overrides={{ borderRadius: 9999 }}
            >
                <button
                    ref={buttonRef}
                    type="button"
                    onClick={handleToggle}
                    className={`${isFull ? 'w-full' : 'w-auto'} h-10 sm:h-11 px-2.5 sm:px-3.5 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-bold text-light-text dark:text-dark-text flex items-center justify-between gap-1.5 sm:gap-2 transition-all cursor-pointer select-none active:scale-95 whitespace-nowrap shrink-0 ${
                        isOpen ? 'ring-2 ring-emerald-500/30' : ''
                    } ${value !== 'all' && value !== '' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}
                >
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 truncate">
                        {IconComp && (
                            <IconComp className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-light-text-secondary dark:text-dark-text-secondary" weight="duotone" />
                        )}
                        <span className="truncate max-w-[120px] sm:max-w-none text-left">{displayLabel}</span>
                    </div>
                    <CaretDown className={`w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0 text-light-text-secondary dark:text-dark-text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} weight="duotone" />
                </button>
            </GlassPanel>

            {/* Portal-Rendered Dropdown Menu: True Liquid Glass design */}
            {isOpen && coords && createPortal(
                <AnimatePresence>
                    <motion.div
                        ref={popoverRef}
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        style={{
                            position: 'fixed',
                            top: coords.top,
                            left: coords.left,
                            width: coords.width,
                            zIndex: 9999
                        }}
                    >
                        <GlassPanel
                            className="wg-glass-card shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_16px_40px_rgba(0,0,0,0.35)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_16px_40px_rgba(0,0,0,0.7)] overflow-hidden"
                            padding="8px"
                            overrides={{ borderRadius: 20 }}
                        >
                            <div className="flex flex-col gap-1.5 w-full">
                                {/* Optional Inline Search for Large Lists */}
                                {searchable && (
                                    <div className="relative flex items-center px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10">
                                        <MagnifyingGlass className="w-3.5 h-3.5 text-light-text-secondary dark:text-dark-text-secondary mr-2 shrink-0" weight="duotone" />
                                        <input
                                            type="text"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="Search..."
                                            className="w-full bg-transparent text-xs font-semibold text-light-text dark:text-dark-text placeholder-light-text-secondary/60 dark:placeholder-dark-text-secondary/60 focus:outline-none"
                                            autoFocus
                                        />
                                        {search && (
                                            <button 
                                                type="button" 
                                                onClick={() => setSearch('')}
                                                className="text-light-text-secondary hover:text-light-text p-0.5 cursor-pointer"
                                            >
                                                <X className="w-3 h-3" weight="duotone" />
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* Options List */}
                                <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                                    {filteredOptions.length === 0 ? (
                                        <div className="px-3 py-3 text-center text-xs text-light-text-secondary dark:text-dark-text-secondary italic">
                                            No matches found
                                        </div>
                                    ) : (
                                        filteredOptions.map((opt) => {
                                            const isSelected = opt.value === value;
                                            return (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => {
                                                        onChange(opt.value);
                                                        setIsOpen(false);
                                                        setSearch('');
                                                    }}
                                                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors cursor-pointer select-none ${
                                                        isSelected
                                                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold shadow-xs'
                                                            : 'text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5'
                                                    }`}
                                                >
                                                    <span className="truncate pr-2">{opt.label}</span>
                                                    {isSelected && (
                                                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" weight="bold" />
                                                    )}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </GlassPanel>
                    </motion.div>
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

export interface LiquidGlassMultiSelectProps {
    value: string[];
    onChange: (val: string[]) => void;
    options: SelectOption[];
    placeholder: string;
    icon?: React.ComponentType<{ className?: string; weight?: any }>;
    align?: 'left' | 'right' | 'center';
    searchable?: boolean;
    className?: string;
    fullWidth?: boolean;
}

export const LiquidGlassMultiSelect: React.FC<LiquidGlassMultiSelectProps> = ({
    value,
    onChange,
    options,
    placeholder,
    icon: IconComp,
    align = 'left',
    searchable = true,
    className = '',
    fullWidth = true,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const buttonRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

    const updatePosition = () => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const popoverWidth = Math.max(rect.width, 260);
        let left: number;
        if (align === 'right') {
            left = rect.right - popoverWidth;
        } else if (align === 'center') {
            left = rect.left + (rect.width / 2) - (popoverWidth / 2);
        } else {
            left = rect.left;
        }
        left = Math.max(12, Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - popoverWidth - 12, left));
        const top = rect.bottom + 8;
        setCoords({ top, left, width: popoverWidth });
    };

    const handleToggle = () => {
        if (!isOpen) {
            updatePosition();
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        const handleScrollOrResize = () => updatePosition();
        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);
        return () => {
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [isOpen, align]);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                popoverRef.current && !popoverRef.current.contains(target) &&
                buttonRef.current && !buttonRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const toggleOption = (val: string) => {
        if (value.includes(val)) {
            onChange(value.filter(v => v !== val));
        } else {
            onChange([...value, val]);
        }
    };

    const filteredOptions = useMemo(() => {
        if (!searchable || !search.trim()) return options;
        const q = search.toLowerCase();
        return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
    }, [options, search, searchable]);

    const displayLabel = value.length === 0
        ? placeholder
        : value.length === 1
        ? (options.find(o => o.value === value[0])?.label || value[0])
        : `${value.length} Selected`;

    return (
        <div className={`relative ${fullWidth ? 'w-full' : 'w-auto shrink-0'} ${className}`}>
            <GlassPanel
                className={`wg-glass-pill ${fullWidth ? 'w-full' : 'w-auto'} shrink-0`}
                padding="0px"
                overrides={{ borderRadius: 9999 }}
            >
                <button
                    ref={buttonRef}
                    type="button"
                    onClick={handleToggle}
                    className={`w-full h-10 sm:h-11 px-3.5 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-bold text-light-text dark:text-dark-text flex items-center justify-between gap-2 transition-all cursor-pointer select-none active:scale-[0.99] whitespace-nowrap shrink-0 ${
                        isOpen ? 'ring-2 ring-emerald-500/30' : ''
                    } ${value.length > 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}
                >
                    <div className="flex items-center gap-2 min-w-0 truncate">
                        {IconComp && (
                            <IconComp className="w-4 h-4 shrink-0 text-light-text-secondary dark:text-dark-text-secondary" weight="duotone" />
                        )}
                        <span className="truncate text-left">{displayLabel}</span>
                        {value.length > 1 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                                {value.length}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {value.length > 0 && (
                            <span
                                role="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange([]);
                                }}
                                className="w-4 h-4 rounded-full flex items-center justify-center text-light-text-secondary hover:text-light-text hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
                                title="Clear selection"
                            >
                                <X className="w-2.5 h-2.5" weight="bold" />
                            </span>
                        )}
                        <CaretDown className={`w-3 h-3 text-light-text-secondary dark:text-dark-text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} weight="duotone" />
                    </div>
                </button>
            </GlassPanel>

            {isOpen && coords && createPortal(
                <AnimatePresence>
                    <motion.div
                        ref={popoverRef}
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        style={{
                            position: 'fixed',
                            top: coords.top,
                            left: coords.left,
                            width: coords.width,
                            zIndex: 9999
                        }}
                    >
                        <GlassPanel
                            className="wg-glass-card shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_16px_40px_rgba(0,0,0,0.35)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_16px_40px_rgba(0,0,0,0.7)] overflow-hidden"
                            padding="8px"
                            overrides={{ borderRadius: 20 }}
                        >
                            <div className="flex flex-col gap-1.5 w-full">
                                {searchable && (
                                    <div className="relative flex items-center px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10">
                                        <MagnifyingGlass className="w-3.5 h-3.5 text-light-text-secondary dark:text-dark-text-secondary mr-2 shrink-0" weight="duotone" />
                                        <input
                                            type="text"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="Search options..."
                                            className="w-full bg-transparent text-xs font-semibold text-light-text dark:text-dark-text placeholder-light-text-secondary/60 dark:placeholder-dark-text-secondary/60 focus:outline-none"
                                            autoFocus
                                        />
                                        {search && (
                                            <button 
                                                type="button" 
                                                onClick={() => setSearch('')}
                                                className="text-light-text-secondary hover:text-light-text p-0.5 cursor-pointer"
                                            >
                                                <X className="w-3 h-3" weight="duotone" />
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className="max-h-60 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                                    {filteredOptions.length === 0 ? (
                                        <div className="px-3 py-3 text-center text-xs text-light-text-secondary dark:text-dark-text-secondary italic">
                                            No matches found
                                        </div>
                                    ) : (
                                        filteredOptions.map((opt) => {
                                            const isSelected = value.includes(opt.value);
                                            return (
                                                <button
                                                    key={opt.value}
                                                    type="button"
                                                    onClick={() => toggleOption(opt.value)}
                                                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors cursor-pointer select-none ${
                                                        isSelected
                                                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold shadow-xs'
                                                            : 'text-light-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5'
                                                    }`}
                                                >
                                                    <span className="truncate pr-2">{opt.label}</span>
                                                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                                        isSelected 
                                                            ? 'bg-emerald-500 border-emerald-500 text-white' 
                                                            : 'border-black/20 dark:border-white/20'
                                                    }`}>
                                                        {isSelected && <Check className="w-3 h-3 text-white" weight="bold" />}
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </GlassPanel>
                    </motion.div>
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};

export default LiquidGlassSelect;
