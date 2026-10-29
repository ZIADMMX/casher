import React from 'react';
import './Card.css';
/**
 * Simple Card component that wraps content.
 * Props:
 *  - children: content inside the card
 *  - title: optional header title
 *  - elevation: optional boolean to use elevated surface
 */
export default function Card({ children, title, elevation = false, ...rest }) {
  const className = `card ${elevation ? 'card-elevated' : ''}`;
  return (
    <div className={className} {...rest}>
      {title && <div className="card-header">{title}</div>}
      <div className="card-body">{children}</div>
    </div>
  );
}
