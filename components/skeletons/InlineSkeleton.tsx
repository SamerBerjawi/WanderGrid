import React from 'react';
import { cn } from '../../utils/cn';
import '../new/new.css';

interface InlineSkeletonProps {
  className?: string;
  rounded?: string; // e.g. 'rounded-xl', 'rounded-full'
}

/** A placeholder bar in the New palette (decision 178). Carries its own `rp-root`, so it works on old pages too. */
export const InlineSkeleton: React.FC<InlineSkeletonProps> = ({
  className = 'h-4 w-full',
  rounded = 'rounded-lg',
}) => (
  <div className={cn('rp-root animate-pulse bg-rp-line/70 motion-reduce:animate-none', rounded, className)} aria-hidden="true" />
);

export default InlineSkeleton;
