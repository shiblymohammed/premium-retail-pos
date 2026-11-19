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
        background: '#ffffff',
        borderRadius: '14px',
        border: '1px solid #eef2f6',
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
            borderTop: '1px solid #f1f5f9',
            background: '#fafbfc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11.5px',
            color: '#64748b',
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
      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #eef2f6' }}>
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
        color: '#64748b',
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
        borderBottom: '1px solid #f8fafc',
        background: isSelected ? '#eff6ff' : '#ffffff',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.1s ease',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.background = '#f8fafd';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = '#ffffff';
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
        color: '#1e293b',
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
