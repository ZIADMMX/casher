import React from 'react';
import './Badge.css';
/**
 * Badge component – displays a small label.
 * Props:
 *  - children: content of the badge
 *  - variant: "success" | "danger" | "warning" | "info" (defaults to "info")
 */
export default function Badge({ children, variant = 'info', className = '' }) {
  const classes = ['ui-badge', `ui-badge-${variant}`, className].filter(Boolean).join(' ');
  return <span className={classes}>{children}</span>;
}
