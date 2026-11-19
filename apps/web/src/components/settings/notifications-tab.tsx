'use client';

import React from 'react';
import { UserPreferences } from './types';

export interface NotificationsTabProps {
  prefs: UserPreferences;
  onUpdate: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
}

export const NotificationsTab: React.FC<NotificationsTabProps> = ({ prefs, onUpdate }) => {
  return (
    <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>Operational Alert Channels</h2>
      <p style={{ margin: '0 0 18px', fontSize: '12px', color: '#64748b' }}>
        Choose which operational events send notifications to your workstation and email.
      </p>

      <div style={{ display: 'grid', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div>
            <strong style={{ display: 'block', fontSize: '13px', color: '#0f172a' }}>Low Stock Warnings</strong>
            <small style={{ color: '#64748b', fontSize: '11px' }}>Notify when items hit their safety buffer threshold</small>
          </div>
          <input
            type="checkbox"
            checked={prefs.notifyLowStockEmail}
            onChange={(e) => onUpdate('notifyLowStockEmail', e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div>
            <strong style={{ display: 'block', fontSize: '13px', color: '#0f172a' }}>Shipment Discrepancy Alerts</strong>
            <small style={{ color: '#64748b', fontSize: '11px' }}>Notify on damaged cartons or in-transit shortages</small>
          </div>
          <input
            type="checkbox"
            checked={prefs.notifyShipmentDiscrepancies}
            onChange={(e) => onUpdate('notifyShipmentDiscrepancies', e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div>
            <strong style={{ display: 'block', fontSize: '13px', color: '#0f172a' }}>Shift Attendance Reminders</strong>
            <small style={{ color: '#64748b', fontSize: '11px' }}>Reminders before shift clock-in cutoff time</small>
          </div>
          <input
            type="checkbox"
            checked={prefs.notifyShiftStart}
            onChange={(e) => onUpdate('notifyShiftStart', e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div>
            <strong style={{ display: 'block', fontSize: '13px', color: '#0f172a' }}>Sale Void & Refund Confirmations</strong>
            <small style={{ color: '#64748b', fontSize: '11px' }}>Alerts on supervisor invoice void or return authorization</small>
          </div>
          <input
            type="checkbox"
            checked={prefs.notifySalesRefunds}
            onChange={(e) => onUpdate('notifySalesRefunds', e.target.checked)}
            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
          />
        </div>
      </div>
    </div>
  );
};

export default NotificationsTab;
