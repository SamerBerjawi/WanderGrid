import React from 'react';

interface InlineSkeletonProps {
  className?: string;
  rounded?: string; // e.g. 'rounded-xl', 'rounded-full'
}

export const InlineSkeleton: React.FC<InlineSkeletonProps> = ({
  className = 'h-4 w-full',
  rounded = 'rounded-lg',
}) => (
  <div className={`wg-skeleton ${rounded} ${className}`} aria-hidden="true" />
);

export default InlineSkeleton;
