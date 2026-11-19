'use client';

import React, { FormEvent } from 'react';

export interface SecurityTabProps {
  currentPassword: string;
  setCurrentPassword: (val: string) => void;
  newPassword: string;
  setNewPassword: (val: string) => void;
  confirmPassword: string;
  setConfirmPassword: (val: string) => void;
  onChangePassword: (e: FormEvent) => void;
  cashierPin: string;
  setCashierPin: (val: string) => void;
  onSavePin: (e: FormEvent) => void;
  pinNotice?: string;
}

export const SecurityTab: React.FC<SecurityTabProps> = ({
  currentPassword,
  setCurrentPassword,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  onChangePassword,
  cashierPin,
  setCashierPin,
  onSavePin,
  pinNotice,
}) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
      {/* CHANGE PASSWORD */}
      <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>Change Account Password</h2>
        <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
          Update your enterprise account credentials.
        </p>

        <form onSubmit={onChangePassword}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              Current Password *
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              New Password *
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 characters"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            />
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              Confirm New Password *
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            />
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: '8px',
              background: '#155eef',
              color: '#ffffff',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Update Account Password
          </button>
        </form>
      </div>

      {/* FAST TERMINAL UNLOCK PIN */}
      <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>Fast Terminal Unlock PIN</h2>
        <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
          Used for instant shift unlock and cashier till access without typing your full email and password.
        </p>

        {pinNotice && (
          <div style={{ padding: '8px 12px', borderRadius: '6px', background: '#ecfdf5', color: '#065f46', fontSize: '12px', marginBottom: '14px' }}>
            ✓ {pinNotice}
          </div>
        )}

        <form onSubmit={onSavePin}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              4-Digit Security PIN *
            </label>
            <input
              type="password"
              maxLength={4}
              required
              value={cashierPin}
              onChange={(e) => setCashierPin(e.target.value)}
              placeholder="1234"
              style={{
                width: '120px',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '18px',
                fontFamily: 'monospace',
                letterSpacing: '0.2em',
                textAlign: 'center',
              }}
            />
          </div>

          <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', color: '#64748b', lineHeight: 1.5, marginBottom: '18px' }}>
            🔒 <strong>Hardware Safeguard:</strong> This PIN allows rapid terminal resumption during busy customer queues while preserving cryptographic session tokens in memory.
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: '8px',
              background: '#155eef',
              color: '#ffffff',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Save 4-Digit Unlock PIN
          </button>
        </form>
      </div>
    </div>
  );
};

export default SecurityTab;
