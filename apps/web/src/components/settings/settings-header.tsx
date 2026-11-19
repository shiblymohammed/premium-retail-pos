'use client';

import React from 'react';

export interface SettingsHeaderProps {
  userInitials: string;
  displayName: string;
  email?: string;
  roleName: string;
  assignedStore?: string;
  onResetDefaults: () => void;
}

export const SettingsHeader: React.FC<SettingsHeaderProps> = ({
  userInitials,
  displayName,
  email,
  roleName,
  assignedStore = 'Downtown Store',
  onResetDefaults,
}) => {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0b1f3a 0%, #173359 100%)',
        borderRadius: '16px',
        padding: '24px 28px',
        color: '#ffffff',
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 8px 24px rgba(11, 31, 58, 0.15)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: '#155eef',
            color: '#ffffff',
            display: 'grid',
            placeItems: 'center',
            fontSize: '20px',
            fontWeight: 800,
            boxShadow: '0 4px 14px rgba(21, 94, 239, 0.4)',
          }}
        >
          {userInitials}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: '#ffffff' }}>
              {displayName || email}
            </h1>
            <span
              style={{
                padding: '3px 9px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#93c5fd',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              {roleName}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '13px' }}>
            {email} • Assigned Store: <strong style={{ color: '#e2e8f0' }}>{assignedStore}</strong>
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="button"
          onClick={onResetDefaults}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#cbd5e1',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reset Defaults
        </button>
      </div>
    </div>
  );
};

export default SettingsHeader;
