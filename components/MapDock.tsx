import React, { useRef } from 'react';
import { motion, MotionValue, useMotionValue, useSpring, useTransform } from 'motion/react';
import { clsx } from 'clsx';

export interface MapDockItem {
  key: string;
  /** Desktop text; on mobile it only shows for the selected item (unless `mobileText` is set). */
  text: string;
  mobileText?: string;
  icon: React.ComponentType<{ className?: string }>;
  selected?: boolean;
  onSelect: () => void;
  selectedClass: string;
  idleClass: string;
  iconClass?: string;
  ariaLabel?: string;
  title?: string;
  /** Small pill after the text (desktop always, mobile only when selected). */
  badge?: React.ReactNode;
  badgeClass?: string;
  /** Always-visible trailing node, e.g. an expand caret. */
  end?: React.ReactNode;
  pressed?: boolean;
  expanded?: boolean;
  /** Icon sits before the text on desktop only (mobile hides it, e.g. when only a count shows). */
  iconDesktopOnly?: boolean;
}

const MAGNIFY = 1.3;
const REACH = 110;

const DockItem: React.FC<{ item: MapDockItem; mouseX: MotionValue<number> }> = ({ item, mouseX }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const distance = useTransform(mouseX, (x) => {
    const b = ref.current?.getBoundingClientRect();
    return b ? x - b.x - b.width / 2 : Infinity;
  });
  const iconScale = useSpring(useTransform(distance, [-REACH, 0, REACH], [1, MAGNIFY, 1]), { mass: 0.1, stiffness: 170, damping: 14 });
  const Icon = item.icon;
  const showText = item.selected;

  return (
    <button
      ref={ref}
      type="button"
      onClick={item.onSelect}
      aria-label={item.ariaLabel ?? item.text}
      aria-pressed={item.pressed}
      aria-expanded={item.expanded}
      title={item.title}
      className={clsx(
        'min-h-[44px] min-w-[44px] rounded-full px-3 md:px-4 inline-flex items-center justify-center gap-2 whitespace-nowrap',
        'text-sm font-bold cursor-pointer select-none transition-colors duration-200 active:scale-95',
        item.selected ? item.selectedClass : item.idleClass
      )}
    >
      <motion.span style={{ scale: iconScale }} className={clsx('inline-flex shrink-0 origin-center', item.iconDesktopOnly && 'hidden md:inline-flex')}>
        <Icon className={clsx('w-5 h-5', item.iconClass)} />
      </motion.span>
      <span className={clsx(showText ? 'inline' : 'hidden md:inline')}>{item.text}</span>
      {item.mobileText && <span className="md:hidden">{item.mobileText}</span>}
      {item.badge != null && (
        <span className={clsx('rounded-full px-2 py-0.5 text-xs font-black', item.badgeClass, showText ? 'inline' : 'hidden md:inline')}>{item.badge}</span>
      )}
      {item.end}
    </button>
  );
};

/** Magic UI-style dock: icons magnify as the pointer nears them (desktop). Labels show on desktop, and on mobile only for the selected item. */
export const MapDock: React.FC<{
  items: MapDockItem[];
  className?: string;
  label?: string;
}> = ({ items, className, label = 'Map layers' }) => {
  const mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      role="group"
      aria-label={label}
      onPointerMove={(e) => { if (e.pointerType === 'mouse') mouseX.set(e.clientX); }}
      onPointerLeave={() => mouseX.set(Infinity)}
      className={clsx('flex flex-nowrap items-center justify-center gap-1 max-w-full', className)}
    >
      {items.map(item => <DockItem key={item.key} item={item} mouseX={mouseX} />)}
    </motion.div>
  );
};

export default MapDock;
