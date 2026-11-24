'use client';

import React from 'react';

export interface AdminTableProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}

export const AdminTable: React.FC<AdminTableProps> = ({ children, footer, style }) => {
  return (
    <div
      style={{
        background: 'var(--retail-card)',
        borderRadius: '14px',
        border: '1px solid var(--retail-edge)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
          {children}
        </table>
      </div>
      {footer && (
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--retail-edge)',
            background: 'var(--retail-raised)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11.5px',
            color: 'var(--retail-muted)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
};

export const AdminTableHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <thead>
      <tr style={{ background: 'var(--retail-raised)', borderBottom: '1px solid var(--retail-edge)' }}>
        {children}
      </tr>
    </thead>
  );
};

export const AdminTableTh: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  align?: 'left' | 'center' | 'right';
}> = ({ children, style, align = 'left' }) => {
  return (
    <th
      style={{
        padding: '13px 20px',
        fontSize: '11px',
        fontWeight: 750,
        color: 'var(--retail-muted)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        textAlign: align,
        ...style,
      }}
    >
      {children}
    </th>
  );
};

export const AdminTableRow: React.FC<{
  children: React.ReactNode;
  isSelected?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}> = ({ children, isSelected = false, onClick, style }) => {
  return (
    <tr
      onClick={onClick}
      style={{
        borderBottom: '1px solid var(--retail-raised)',
        background: isSelected ? 'var(--retail-accent-soft)' : 'var(--retail-card)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.1s ease',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'var(--retail-raised)';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'var(--retail-card)';
      }}
    >
      {children}
    </tr>
  );
};

export const AdminTableTd: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  align?: 'left' | 'center' | 'right';
}> = ({ children, style, align = 'left' }) => {
  return (
    <td
      style={{
        padding: '14px 20px',
        fontSize: '12.5px',
        color: 'var(--retail-ink)',
        textAlign: align,
        verticalAlign: 'middle',
        ...style,
      }}
    >
      {children}
    </td>
  );
};

export default AdminTable;
