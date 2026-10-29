import React from 'react';
import './Button.css';

/**
 * Reusable button component.
 * Props:
 *  - children: button label/content
 *  - onClick: click handler
 *  - variant: 'primary' | 'secondary' | 'danger' (default: 'primary')
 *  - disabled: boolean
 */
export default function Button({ children, onClick, variant = 'primary', disabled, ...rest }) {
  const className = `btn btn-${variant}`;
  return (
    <button
      type="button"  /* Force button semantics */
      className={className}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}
