'use strict';
// Server copy of utils/tripKind.ts (decision D-04). Keep the two in step.
const tripKind = (t) => {
    if (!t || typeof t !== 'object') return 'trip';
    if (t.kind === 'trip' || t.kind === 'timeoff' || t.kind === 'bundle') return t.kind;
    if (t.isBundleOnly) return 'bundle';
    if (typeof t.id === 'string' && t.id.startsWith('leave-')) return 'timeoff';
    if (t.hideInPlanner) return 'bundle';
    return 'trip';
};
module.exports = { tripKind };
