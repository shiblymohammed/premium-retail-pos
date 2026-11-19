'use client';

import React from 'react';
import { UserPreferences } from './types';

export interface GeneralTabProps {
  prefs: UserPreferences;
  onUpdate: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({ prefs, onUpdate }) => {
  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* Audio & Sound */}
      <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>Audio & Scanner Feedback</h2>
        <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
          Control sound effects for barcode scanning, warning chimes, and action feedback.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div>
              <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>Sound FX & Scan Beep</strong>
              <small style={{ color: '#64748b', fontSize: '11px' }}>Audio confirmation on barcode read</small>
            </div>
            <input
              type="checkbox"
              checked={prefs.soundFxEnabled}
              onChange={(e) => onUpdate('soundFxEnabled', e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div>
              <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>Keyboard Navigation Bar</strong>
              <small style={{ color: '#64748b', fontSize: '11px' }}>Show F1, F8, ESC cues at screen base</small>
            </div>
            <input
              type="checkbox"
              checked={prefs.showKeyboardHints}
              onChange={(e) => onUpdate('showKeyboardHints', e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>

      {/* Regional & Timezone Formats */}
      <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>Display & Regional Formats</h2>
        <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
          Select display currency formatting, date presentation, and workstation idle auto-lock.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              Workstation Currency Symbol
            </label>
            <select
              value={prefs.currencySymbol}
              onChange={(e) => onUpdate('currencySymbol', e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
            >
              <option value="INR (₹)">INR - Indian Rupee (₹)</option>
              <option value="USD ($)">USD - US Dollar ($)</option>
              <option value="EUR (€)">EUR - Euro (€)</option>
              <option value="AED (د.إ)">AED - UAE Dirham (د.إ)</option>
              <option value="GBP (£)">GBP - British Pound (£)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              Date & Time Format
            </label>
            <select
              value={prefs.dateFormat}
              onChange={(e) => onUpdate('dateFormat', e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
            >
              <option value="DD-MMM-YYYY 12h">DD-MMM-YYYY (e.g. 19-Nov-2026 10:45 AM)</option>
              <option value="YYYY-MM-DD 24h">ISO 8601 24h (e.g. 2026-11-19 10:45)</option>
              <option value="MM/DD/YYYY">US Format (e.g. 11/19/2026)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              Terminal Idle Auto-Lock
            </label>
            <select
              value={prefs.autoLockMinutes}
              onChange={(e) => onUpdate('autoLockMinutes', Number(e.target.value))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
            >
              <option value={2}>Lock after 2 minutes of inactivity</option>
              <option value={5}>Lock after 5 minutes</option>
              <option value={15}>Lock after 15 minutes (Standard)</option>
              <option value={30}>Lock after 30 minutes</option>
              <option value={0}>Disabled (Never auto-lock)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralTab;
