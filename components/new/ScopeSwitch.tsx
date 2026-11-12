import React from 'react';
import { RpChip } from './ui';
import type { Scope } from '../../utils/scope';

/** Mine / Everyone: whose records a page counts. Hidden when only one member exists (nothing to switch). */
export const ScopeSwitch: React.FC<{ scope: Scope; onChange: (s: Scope) => void; className?: string }> = ({ scope, onChange, className }) => (
    <div role="group" aria-label="Whose records to show" className={className ?? 'flex items-center gap-1'}>
        <RpChip selected={scope === 'mine'} onClick={() => onChange('mine')}>Mine</RpChip>
        <RpChip selected={scope === 'everyone'} onClick={() => onChange('everyone')}>Everyone</RpChip>
    </div>
);
