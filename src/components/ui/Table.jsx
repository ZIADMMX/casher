import React from 'react';
import './Table.css';
/**
 * Simple Table component.
 * Props:
 *  - columns: array of header strings
 *  - data: array of rows (each row is array of cells)
 *  - emptyMessage: optional message when data is empty
 */
export default function Table({ columns = [], data = [], emptyMessage = 'No data' }) {
  return (
    <table className="table">
      <thead>
        <tr>
          {columns.map((col, idx) => (
            <th key={idx}>{col}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="table-empty">{emptyMessage}</td>
          </tr>
        ) : (
          data.map((row, rIdx) => (
            <tr key={rIdx}>
              {row.map((cell, cIdx) => (
                <td key={cIdx}>{cell}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
