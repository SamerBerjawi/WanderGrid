import React from 'react';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import MAP_SETTINGS_LABELS from '../labels';

interface FilterTabProps {
  content: React.ReactNode;
  activeFilterCount?: number;
  onClearFilters?: () => void;
}

export const FilterTab: React.FC<FilterTabProps> = ({
  content,
  activeFilterCount = 0,
  onClearFilters,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Top Clear Filters button when any filter is active */}
      {activeFilterCount > 0 && onClearFilters && (
        <div className="flex items-center justify-between pb-1">
          <span className="text-2xs font-bold uppercase tracking-wider text-light-text-secondary dark:text-dark-text-secondary">
            {activeFilterCount} active filter{activeFilterCount > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={onClearFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors active:scale-95 cursor-pointer"
          >
            <ArrowCounterClockwise className="w-3.5 h-3.5" weight="bold" />
            <span>{MAP_SETTINGS_LABELS.filterTab.clearFilters}</span>
          </button>
        </div>
      )}

      {/* Filter content provided by parent (ExpeditionMapView) */}
      <div className="space-y-5">{content}</div>
    </div>
  );
};

export default FilterTab;
