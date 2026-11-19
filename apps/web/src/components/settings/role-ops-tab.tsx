'use client';

import React from 'react';
import { UserPreferences } from './types';

export interface RoleOpsTabProps {
  role: string;
  prefs: UserPreferences;
  onUpdate: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
}

export const RoleOpsTab: React.FC<RoleOpsTabProps> = ({ role, prefs, onUpdate }) => {
  const isCashier = role === 'CASHIER';
  const isStoreManager = role === 'STORE_MANAGER';
  const isWarehouse = role === 'CENTRAL_MANAGER' || role === 'WAREHOUSE_MANAGER' || role === 'SUB_WAREHOUSE_MANAGER';
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const isStaff = role === 'STAFF';

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* CASHIER SPECIFIC SETTINGS */}
      {isCashier && (
        <>
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>Thermal Receipt Printer & Hardware</h2>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
              Configure POS thermal roll width, auto-cut, and cash drawer kick trigger.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Thermal Paper Roll Width
                </label>
                <select
                  value={prefs.printerWidth}
                  onChange={(e) => onUpdate('printerWidth', e.target.value as '80mm' | '58mm')}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                >
                  <option value="80mm">80mm Wide (Standard High-Speed POS)</option>
                  <option value="58mm">58mm Compact (Mobile / Counter Terminal)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>Auto-Print on Checkout</strong>
                  <small style={{ color: '#64748b', fontSize: '11px' }}>Generate receipt voucher immediately</small>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.autoPrintReceipt}
                  onChange={(e) => onUpdate('autoPrintReceipt', e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>Cash Drawer Kick Pulse</strong>
                  <small style={{ color: '#64748b', fontSize: '11px' }}>Open drawer relay on cash sale</small>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.cashDrawerAutoKick}
                  onChange={(e) => onUpdate('cashDrawerAutoKick', e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>

          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>Scanner Behavior & Fast Cash Tender</h2>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
              Barcode scanner input speed and quick denomination chips for fast checkout.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>Auto-Increment on Rescan</strong>
                  <small style={{ color: '#64748b', fontSize: '11px' }}>Repeated SKU scans add +1 to cart</small>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.incrementOnRescan}
                  onChange={(e) => onUpdate('incrementOnRescan', e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>Print Store Logo on Receipt</strong>
                  <small style={{ color: '#64748b', fontSize: '11px' }}>Includes corporate brand emblem</small>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.printStoreLogo}
                  onChange={(e) => onUpdate('printStoreLogo', e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* STORE MANAGER SPECIFIC SETTINGS */}
      {isStoreManager && (
        <>
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>Store Floor & Inventory Thresholds</h2>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
              Configure stock safety margins and supervisory alerts for Downtown Store.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Low Stock Warning Buffer (Units)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={prefs.lowStockBuffer}
                  onChange={(e) => onUpdate('lowStockBuffer', Number(e.target.value))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
                <small style={{ color: '#64748b', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                  Alert is triggered when shelf stock reaches this number.
                </small>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Cash Register Max Float Limit (₹)
                </label>
                <input
                  type="number"
                  step="5000"
                  value={prefs.drawerFloatLimitWarning}
                  onChange={(e) => onUpdate('drawerFloatLimitWarning', Number(e.target.value))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
                <small style={{ color: '#64748b', fontSize: '11px', display: 'block', marginTop: '4px' }}>
                  Alerts cashier to perform cash drop when exceeded.
                </small>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>Negative Stock Reconciliation Alert</strong>
                  <small style={{ color: '#64748b', fontSize: '11px' }}>Highlight OD-03 ledger variances immediately</small>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.negativeStockAlert}
                  onChange={(e) => onUpdate('negativeStockAlert', e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>Auto-Print Daily Shift Summary (Z-Report)</strong>
                  <small style={{ color: '#64748b', fontSize: '11px' }}>Summarize revenue at shift changeover</small>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.autoGenerateShiftReport}
                  onChange={(e) => onUpdate('autoGenerateShiftReport', e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>
            </div>
          </div>

          {/* Receipt Header & Footer Customization */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>Store Receipt Policy Notes</h2>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
              Text printed on customer receipts generated at Downtown Store lanes.
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Receipt Header Tagline
              </label>
              <input
                type="text"
                value={prefs.receiptHeaderTagline}
                onChange={(e) => onUpdate('receiptHeaderTagline', e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Return Policy Footnote
              </label>
              <input
                type="text"
                value={prefs.receiptFooterReturnPolicy}
                onChange={(e) => onUpdate('receiptFooterReturnPolicy', e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
              />
            </div>
          </div>
        </>
      )}

      {/* WAREHOUSE MANAGER SPECIFIC SETTINGS */}
      {isWarehouse && (
        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>Warehouse Logistics & Dispatch Policies</h2>
          <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
            Barcode formats, damage quarantine routing, and freight dispatch manifest controls.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Default Shipping Label Format
              </label>
              <select
                value={prefs.shippingLabelFormat}
                onChange={(e) => onUpdate('shippingLabelFormat', e.target.value as '4x6' | '2x1')}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
              >
                <option value="4x6">4" x 6" Pallet & Freight Manifest</option>
                <option value="2x1">2" x 1" Carton Shelf Barcode</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Default Assigned Carrier
              </label>
              <select
                value={prefs.defaultFreightCarrier}
                onChange={(e) => onUpdate('defaultFreightCarrier', e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
              >
                <option value="BlueDart Logistics">BlueDart Logistics (Express)</option>
                <option value="FastTrack Express">FastTrack Express (Regional)</option>
                <option value="Internal Fleet Van #01">Internal Fleet Van #01</option>
                <option value="Internal Fleet Van #02">Internal Fleet Van #02</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>Auto-Quarantine Damaged Goods</strong>
                <small style={{ color: '#64748b', fontSize: '11px' }}>Instantly lock damaged units in quarantine ledger</small>
              </div>
              <input
                type="checkbox"
                checked={prefs.damageAutoQuarantine}
                onChange={(e) => onUpdate('damageAutoQuarantine', e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>Driver Seal Confirmation Required</strong>
                <small style={{ color: '#64748b', fontSize: '11px' }}>Dispatches require physical truck seal log</small>
              </div>
              <input
                type="checkbox"
                checked={prefs.requireDriverSealConfirmation}
                onChange={(e) => onUpdate('requireDriverSealConfirmation', e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ADMIN & SUPER ADMIN SPECIFIC SETTINGS */}
      {isAdmin && (
        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>Enterprise Invariants & Governance Rules</h2>
          <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
            Global security invariants, physical location dual-axis controls, and audit rules.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>Enforce Dual-Axis Location Binding</strong>
                <small style={{ color: '#64748b', fontSize: '11px' }}>Strict Invariant 11 (Users bound to physical stores)</small>
              </div>
              <input
                type="checkbox"
                checked={prefs.enforceDualAxisBinding}
                onChange={(e) => onUpdate('enforceDualAxisBinding', e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>Strict Audit Freeze Check</strong>
                <small style={{ color: '#64748b', fontSize: '11px' }}>ADR-010 checkout lock during stocktake</small>
              </div>
              <input
                type="checkbox"
                checked={prefs.strictAuditFreezeCheck}
                onChange={(e) => onUpdate('strictAuditFreezeCheck', e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div>
                <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b' }}>Require Reason on Void / Refund</strong>
                <small style={{ color: '#64748b', fontSize: '11px' }}>OD-08 supervisor mandatory audit logging</small>
              </div>
              <input
                type="checkbox"
                checked={prefs.requireCancellationReason}
                onChange={(e) => onUpdate('requireCancellationReason', e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Administrative Shortcuts */}
          <div style={{ padding: '14px 16px', background: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
            <strong style={{ fontSize: '12px', color: '#1e40af', display: 'block', marginBottom: '8px' }}>
              Quick Shortcuts to Enterprise Consoles:
            </strong>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <a href="/admin/users" style={{ padding: '6px 12px', borderRadius: '6px', background: '#fff', border: '1px solid #93c5fd', color: '#1d4ed8', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>
                👥 User Directory →
              </a>
              <a href="/admin/company" style={{ padding: '6px 12px', borderRadius: '6px', background: '#fff', border: '1px solid #93c5fd', color: '#1d4ed8', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>
                🏛 Company & Locations →
              </a>
              <a href="/admin/discount-limits" style={{ padding: '6px 12px', borderRadius: '6px', background: '#fff', border: '1px solid #93c5fd', color: '#1d4ed8', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>
                ◇ Discount Caps →
              </a>
              <a href="/admin/sales-permissions" style={{ padding: '6px 12px', borderRadius: '6px', background: '#fff', border: '1px solid #93c5fd', color: '#1d4ed8', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>
                ⚿ Sale Permissions →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* STAFF SPECIFIC SETTINGS */}
      {isStaff && (
        <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 4px', color: '#0f172a' }}>Shift & QR Clock-In Setup</h2>
          <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>
            Camera preferences and arrival alert reminders.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Preferred QR Scanner Camera
              </label>
              <select
                value={prefs.qrCameraFacing}
                onChange={(e) => onUpdate('qrCameraFacing', e.target.value as 'environment' | 'user')}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
              >
                <option value="environment">Back Camera (Standard phone scanner)</option>
                <option value="user">Front Camera (Selfie / Desktop kiosk)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Shift Arrival Alert (Minutes before shift)
              </label>
              <select
                value={prefs.shiftReminderAdvanceMinutes}
                onChange={(e) => onUpdate('shiftReminderAdvanceMinutes', Number(e.target.value))}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
              >
                <option value={15}>15 minutes before shift</option>
                <option value={30}>30 minutes before shift (Recommended)</option>
                <option value={60}>1 hour before shift</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleOpsTab;
