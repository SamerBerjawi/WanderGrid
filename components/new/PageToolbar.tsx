import React, { useEffect, useRef } from 'react';
import { MagnifyingGlass, X } from '../ui/hugeicons';
import { Toolbar, type DockTool } from '../kokonutui/tool-dock';
import { cn } from '../../utils/cn';

/**
 * The tool bar of a New page (UI_UX_DESIGN_REFERENCE.md §2.2): the Tool Dock, laid flat in the page's
 * header row, holding the page's view toggle, search and main actions. Search opens an inline field
 * beside the dock that filters the page as you type.
 */

export interface PageSearch {
    open: boolean;
    query: string;
    onQueryChange: (query: string) => void;
    onClose: () => void;
    label: string;
    placeholder: string;
}

/** Width of the dock for n tools (44px buttons, 8px gaps and padding) plus a divider's width. */
const dockWidth = (tools: DockTool[]) =>
    tools.length * 44 + (tools.length - 1) * 8 + 16 + tools.filter(t => t.dividerBefore).length * 9 + 2;

export const RpPageToolbar: React.FC<{
    tools: DockTool[];
    value?: string;
    onValueChange?: (id: string) => void;
    ariaLabel: string;
    search?: PageSearch;
    className?: string;
}> = ({ tools, value, onValueChange, ariaLabel, search, className }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { if (search?.open) inputRef.current?.focus(); }, [search?.open]);

    return (
        <div className={cn('flex min-w-0 flex-wrap items-center gap-x-2', className)}>
            {search?.open ? (
                <label className="relative order-last flex min-w-0 basis-full items-center pb-2 sm:order-none sm:w-64 sm:basis-auto sm:pb-0">
                    <span className="sr-only">{search.label}</span>
                    <MagnifyingGlass size={16} className="pointer-events-none absolute left-4 text-rp-muted" aria-hidden />
                    <input
                        ref={inputRef}
                        type="search"
                        value={search.query}
                        onChange={e => search.onQueryChange(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); search.onQueryChange(''); search.onClose(); } }}
                        placeholder={search.placeholder}
                        className="min-h-11 w-full rounded-full bg-rp-surface pr-10 pl-10 text-sm text-rp-ink outline-none rp-shadow-soft placeholder:text-rp-muted focus-visible:ring-2 focus-visible:ring-rp-muted [&::-webkit-search-cancel-button]:hidden"
                    />
                    <button
                        type="button"
                        aria-label="Close search"
                        onClick={() => { search.onQueryChange(''); search.onClose(); }}
                        className="absolute right-0 flex size-11 items-center justify-center rounded-full text-rp-muted hover:text-rp-ink"
                    >
                        <X size={16} />
                    </button>
                </label>
            ) : null}
            <div className="relative h-[72px] shrink-0" style={{ width: dockWidth(tools) + 8 }}>
                <Toolbar
                    key={tools.map(t => t.id).join('|')}
                    tools={tools}
                    value={value}
                    onValueChange={onValueChange}
                    tone="surface"
                    defaultEdge="top"
                    fixed
                    shortcuts="off"
                    ariaLabel={ariaLabel}
                    className="pointer-events-none absolute inset-0 overflow-visible"
                    dockClassName="pointer-events-auto"
                >
                    <span />
                </Toolbar>
            </div>
        </div>
    );
};
