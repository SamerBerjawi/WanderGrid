import React from 'react';

export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  name: string;
  className?: string;
}

export const Icon: React.FC<IconProps> = ({ name, className = '', ...props }) => {
  return (
    <span
      className={`material-icons-outlined select-none inline-flex items-center justify-center leading-none ${className}`}
      {...props}
    >
      {name}
    </span>
  );
};

export default Icon;
