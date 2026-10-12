import React, {
  forwardRef, ReactNode, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import GlassPanel from './GlassPanel';
import { CaretDown, Check } from '@phosphor-icons/react';

export interface GlassSelectOption {
  value: string;
  label: string;
  /** Optional leading icon shown in the trigger and the list (Phosphor, per Design.md). */
  icon?: ReactNode;
}

export interface GlassSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: GlassSelectOption[];
  error?: string;
  leftElement?: ReactNode;
  containerClassName?: string;
  children?: ReactNode;
}

interface FlatOption extends GlassSelectOption {
  disabled?: boolean;
  group?: string;
}

const textOf = (node: ReactNode): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
};

// Reads <option>/<optgroup> children so existing call sites keep their markup.
const flattenChildren = (children: ReactNode, group?: string): FlatOption[] => {
  const out: FlatOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { value?: unknown; label?: string; disabled?: boolean; children?: ReactNode };
    if (child.type === 'option') {
      const label = textOf(props.children);
      out.push({ value: props.value !== undefined ? String(props.value) : label, label, disabled: props.disabled, group });
    } else if (child.type === 'optgroup') {
      out.push(...flattenChildren(props.children, props.label));
    } else if (child.type === React.Fragment) {
      out.push(...flattenChildren(props.children, group));
    }
  });
  return out;
};

const MIN_LIST_WIDTH = 200;

export const GlassSelect = forwardRef<HTMLSelectElement, GlassSelectProps>(({
  label,
  options,
  error,
  leftElement,
  className = '',
  containerClassName = '',
  disabled,
  children,
  ...props
}, ref) => {
  // The visible label names the select for assistive tech (UI-004: axe select-name).
  const generatedId = useId();
  const selectId = props.id || generatedId;
  const labelId = `${selectId}-label`;
  const listId = `${selectId}-list`;

  const nativeRef = useRef<HTMLSelectElement>(null);
  useImperativeHandle(ref, () => nativeRef.current as HTMLSelectElement);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  const items = useMemo<FlatOption[]>(
    () => (options ? options.map(o => ({ ...o })) : flattenChildren(children)),
    [options, children],
  );

  // Controlled value wins; otherwise track the native element (uncontrolled / defaultValue).
  const [uncontrolled, setUncontrolled] = useState<string>(() =>
    props.defaultValue !== undefined ? String(props.defaultValue as string) : (items[0]?.value ?? ''));
  const current = props.value !== undefined ? String(props.value as string) : uncontrolled;
  const selected = items.find(o => o.value === current) ?? (props.value === undefined ? items[0] : undefined);

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const close = useCallback((refocus = false) => {
    setIsOpen(false);
    setActiveIndex(-1);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const updateCoords = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const width = Math.min(Math.max(rect.width, MIN_LIST_WIDTH), viewportW - 24);
    const left = Math.max(12, Math.min(viewportW - width - 12, rect.left));
    const below = viewportH - rect.bottom - 18;
    const above = rect.top - 18;
    const listHeight = listRef.current?.scrollHeight ?? 280;
    const openUp = below < Math.min(listHeight, 220) && above > below;
    const maxHeight = Math.max(120, Math.min(320, openUp ? above : below));
    const height = Math.min(listHeight, maxHeight);
    const top = openUp ? Math.max(12, rect.top - height - 6) : rect.bottom + 6;
    setCoords({ top, left, width, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateCoords();
  }, [isOpen, updateCoords, items.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onMove = () => updateCoords();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('mousedown', onDown);
    };
  }, [isOpen, updateCoords, close]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex]);

  const open = () => {
    if (disabled || items.length === 0) return;
    const idx = items.findIndex(o => o.value === current && !o.disabled);
    setActiveIndex(idx >= 0 ? idx : items.findIndex(o => !o.disabled));
    setIsOpen(true);
  };

  // Commit through the real <select> so React's onChange fires with a genuine event.
  const commit = (value: string) => {
    const el = nativeRef.current;
    if (el && el.value !== value) {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setUncontrolled(value);
    close(true);
  };

  const step = (from: number, dir: 1 | -1) => {
    for (let i = 1; i <= items.length; i++) {
      const idx = (from + dir * i + items.length * 2) % items.length;
      if (!items[idx].disabled) return idx;
    }
    return from;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => step(i, 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => step(i, -1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActiveIndex(items.findIndex(o => !o.disabled)); }
    else if (e.key === 'End') { e.preventDefault(); setActiveIndex(items.length - 1 - [...items].reverse().findIndex(o => !o.disabled)); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (activeIndex >= 0 && !items[activeIndex].disabled) commit(items[activeIndex].value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // the open list consumes Escape; surrounding dialogs stay open
      close(true);
    } else if (e.key === 'Tab') {
      close();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const now = Date.now();
      const text = (now - typeahead.current.at > 700 ? '' : typeahead.current.text) + e.key.toLowerCase();
      typeahead.current = { text, at: now };
      const hit = items.findIndex(o => !o.disabled && o.label.toLowerCase().startsWith(text));
      if (hit >= 0) setActiveIndex(hit);
    }
  };

  const { onChange, value: _value, defaultValue: _defaultValue, id: _id, ...nativeProps } = props;

  return (
    <div className={`flex flex-col gap-1.5 w-full ${containerClassName}`}>
      {label && (
        <label id={labelId} htmlFor={selectId} className="block text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
          {label}
        </label>
      )}
      <div className="relative group w-full">
        <GlassPanel
          className={`wg-glass-pill w-full transition-all duration-180 ease-glass ${
            error ? 'border-rose-500/50' : 'border-black/10 dark:border-white/10 group-focus-within:border-primary-500/60'
          } ${disabled ? 'opacity-50' : ''} min-h-[44px] h-11`}
          padding="0px"
          overrides={{ borderRadius: 20 }}
        >
          <div className="flex items-center min-h-[44px] h-11 px-3.5 w-full gap-2 relative">
            {leftElement && <span className="shrink-0 text-light-text-secondary dark:text-dark-text-secondary">{leftElement}</span>}

            {/* Real select: carries form value, ref and change events. Not focusable; the button below is the control. */}
            <select
              {...nativeProps}
              ref={nativeRef}
              id={selectId}
              disabled={disabled}
              value={props.value}
              defaultValue={props.value === undefined ? props.defaultValue : undefined}
              onChange={(e) => { setUncontrolled(e.target.value); onChange?.(e); }}
              tabIndex={-1}
              aria-hidden="true"
              className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
            >
              {options
                ? options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)
                : children}
            </select>

            <button
              ref={triggerRef}
              type="button"
              role="combobox"
              aria-haspopup="listbox"
              aria-expanded={isOpen}
              aria-controls={isOpen ? listId : undefined}
              aria-labelledby={label ? labelId : undefined}
              aria-label={label ? undefined : (props['aria-label'] as string | undefined)}
              aria-invalid={error ? true : undefined}
              disabled={disabled}
              onClick={() => (isOpen ? close() : open())}
              onKeyDown={onKeyDown}
              className={`flex-1 min-w-0 text-left bg-transparent text-xs font-bold text-light-text dark:text-dark-text focus:outline-none cursor-pointer pr-7 py-2.5 truncate disabled:cursor-not-allowed ${className}`}
            >
              <span className="flex items-center gap-2 min-w-0">
                {selected?.icon && <span className="shrink-0 text-primary-500">{selected.icon}</span>}
                <span className="truncate">{selected?.label ?? ''}</span>
              </span>
            </button>

            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-light-text-secondary dark:text-dark-text-secondary opacity-70">
              <CaretDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} weight="bold" />
            </div>
          </div>
        </GlassPanel>
      </div>
      {error && <p className="text-2xs text-rose-500 font-bold ml-1">{error}</p>}

      {isOpen && coords && createPortal(
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, maxHeight: coords.maxHeight, zIndex: 70 /* z-popover */ }}
          className="wg-glass-dropdown rounded-2xl overflow-y-auto p-1.5 custom-scrollbar flex flex-col gap-0.5 box-border animate-fadeIn"
        >
          {items.map((item, index) => {
            const isSelected = item.value === current;
            const isActive = index === activeIndex;
            const showGroup = item.group && item.group !== items[index - 1]?.group;
            return (
              <React.Fragment key={`${item.value}-${index}`}>
                {showGroup && (
                  <li role="presentation" className="px-3 pt-2 pb-1 text-2xs font-black uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
                    {item.group}
                  </li>
                )}
                <li
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={item.disabled || undefined}
                  data-index={index}
                  onMouseEnter={() => !item.disabled && setActiveIndex(index)}
                  onMouseDown={(e) => e.preventDefault()} // keep focus on the trigger
                  onClick={() => !item.disabled && commit(item.value)}
                  className={`px-3 min-h-[44px] flex items-center justify-between gap-3 rounded-xl text-xs font-bold text-left border transition-colors ${
                    item.disabled
                      ? 'opacity-40 cursor-not-allowed border-transparent'
                      : isActive
                        ? 'cursor-pointer bg-primary-500/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-300 border-primary-500/20'
                        : 'cursor-pointer text-light-text dark:text-dark-text border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    {item.icon && <span className="shrink-0 text-primary-500">{item.icon}</span>}
                    <span className="truncate">{item.label}</span>
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-primary-500" weight="bold" />}
                </li>
              </React.Fragment>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
});

GlassSelect.displayName = 'GlassSelect';
export default GlassSelect;
