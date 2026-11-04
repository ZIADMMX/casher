import React from 'react';
import './Input.css';

/**
 * Reusable input component.
 * Props:
 *  - value: current value
 *  - onChange: change handler
 *  - placeholder: placeholder text
 *  - type: input type (text, number, password, etc.)
 *  - disabled: boolean
 *  - error: boolean – shows error styling when true
 */
export default function Input({
  value,
  onChange,
  placeholder = '',
  type = 'text',
  disabled = false,
  error = false,
  className = '',
  ...rest
}) {
  const classes = ['input', error ? 'input-error' : '', className].filter(Boolean).join(' ');
  return (
    <input
      className={classes}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      {...rest}
    />
  );
}
