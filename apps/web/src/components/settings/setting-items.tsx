'use client';

import React, { FormEvent, useState } from 'react';
import { UserPreferences } from './types';
import { ChoiceList, Icon, NumberField, ToggleRow } from './setting-controls';
import styles from './settings.module.css';

export type UpdatePref = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;

export interface SettingItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  /** Short "current value" shown on the row, e.g. "After 15 min" */
  summary: (p: UserPreferences) => string;
  /** Rows with a link go straight to another page instead of opening a panel */
  href?: string;
}

export interface SettingGroup {
  id: string;
  title: string;
  description: string;
  items: SettingItem[];
}

const onOff = (v: boolean) => (v ? 'On' : 'Off');
const countOn = (...v: boolean[]) => `${v.filter(Boolean).length} of ${v.length} on`;

// ---------- Option lists (same values as before) ----------
const CURRENCIES = [
  { value: 'INR (₹)', label: 'INR - Indian Rupee (₹)' },
  { value: 'USD ($)', label: 'USD - US Dollar ($)' },
  { value: 'EUR (€)', label: 'EUR - Euro (€)' },
  { value: 'AED (د.إ)', label: 'AED - UAE Dirham (د.إ)' },
  { value: 'GBP (£)', label: 'GBP - British Pound (£)' },
];
const DATE_FORMATS = [
  { value: 'DD-MMM-YYYY 12h', label: 'DD-MMM-YYYY', detail: 'e.g. 19-Nov-2026 10:45 AM' },
  { value: 'YYYY-MM-DD 24h', label: 'ISO 8601, 24-hour', detail: 'e.g. 2026-11-19 10:45' },
  { value: 'MM/DD/YYYY', label: 'US format', detail: 'e.g. 11/19/2026' },
];
const LOCK_TIMES = [
  { value: 2, label: '2 minutes', detail: 'Best for busy shared counters' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes', detail: 'Standard' },
  { value: 30, label: '30 minutes' },
  { value: 0, label: 'Never', detail: 'The screen stays unlocked' },
];
const CARRIERS = [
  { value: 'BlueDart Logistics', label: 'BlueDart Logistics', detail: 'Express' },
  { value: 'FastTrack Express', label: 'FastTrack Express', detail: 'Regional' },
  { value: 'Internal Fleet Van #01', label: 'Internal Fleet Van #01', detail: 'Own vehicle' },
  { value: 'Internal Fleet Van #02', label: 'Internal Fleet Van #02', detail: 'Own vehicle' },
];

const labelOf = <T,>(list: { value: T; label: string }[], v: T) => list.find((o) => o.value === v)?.label ?? String(v);
const short = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------- Groups shown on the page, by role ----------
export function getSettingGroups(role: string): SettingGroup[] {
  const isCashier = role === 'CASHIER';
  const isStoreManager = role === 'STORE_MANAGER';
  const isWarehouse = role === 'CENTRAL_MANAGER' || role === 'WAREHOUSE_MANAGER' || role === 'SUB_WAREHOUSE_MANAGER';
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

  const account: SettingGroup = {
    id: 'account',
    title: 'Your account',
    description: 'How you sign in and unlock this screen.',
    items: [
      { id: 'password', icon: 'key', title: 'Password', description: 'Change the password you use to sign in', summary: () => 'Change' },
      { id: 'pin', icon: 'pin', title: 'Quick unlock PIN', description: 'A 4-digit PIN to get back in after the screen locks', summary: () => 'Set' },
    ],
  };

  const device: SettingGroup = {
    id: 'device',
    title: 'This device',
    description: 'Applies to this computer or till only.',
    items: [
      { id: 'sound', icon: 'sound', title: 'Sounds & keyboard hints', description: 'Scan beep and the F1 / F8 / ESC shortcut bar', summary: (p) => `${p.soundFxEnabled ? `Sound ${p.scanBeepVolume}%` : 'Sound off'} · Hints ${onOff(p.showKeyboardHints).toLowerCase()}` },
      { id: 'region', icon: 'globe', title: 'Currency & date format', description: 'How money and dates are shown on screen', summary: (p) => `${p.currencySymbol} · ${labelOf(DATE_FORMATS, p.dateFormat)}` },
      { id: 'autolock', icon: 'lock', title: 'Screen lock', description: 'Lock the screen when nobody is using it', summary: (p) => (p.autoLockMinutes ? `After ${p.autoLockMinutes} min` : 'Never') },
    ],
  };

  const groups: SettingGroup[] = [account, device];

  // Cashier: the till they work at
  if (isCashier) {
    groups.push({
      id: 'till', title: 'Till & receipts', description: 'Printer, cash drawer, scanner and quick cash at your counter.',
      items: [
        { id: 'printer', icon: 'printer', title: 'Receipt printer & cash drawer', description: 'Paper width, auto-print and drawer opening', summary: (p) => `${p.printerWidth} · Auto-print ${onOff(p.autoPrintReceipt).toLowerCase()}` },
        { id: 'scanner', icon: 'scan', title: 'Scanner & receipt logo', description: 'Scanner type and what happens when you scan an item twice', summary: (p) => `${p.scannerMode === 'hardware' ? 'Handheld scanner' : 'Camera'} · ${p.incrementOnRescan ? 'Rescan adds +1' : 'Rescan adds a line'}` },
        { id: 'fastcash', icon: 'grid', title: 'Quick cash buttons', description: 'The note amounts shown when a customer pays in cash', summary: (p) => p.fastCashButtons.map((v) => `₹${v}`).join(' · ') },
      ],
    });
  }

  // Store manager and admin: store rules (both run stores, attendance and returns)
  if (isStoreManager || isAdmin) {
    groups.push({
      id: 'store', title: 'Store rules', description: isAdmin ? 'Alerts, receipt text and attendance for your stores.' : 'Alerts, receipt text and attendance for Downtown Store.',
      items: [
        { id: 'stock', icon: 'box', title: 'Stock & cash alerts', description: 'When to warn about low stock or a full cash drawer', summary: (p) => `Low stock at ${p.lowStockBuffer} units` },
        { id: 'receipt', icon: 'receipt', title: 'Receipt text', description: 'Tagline and return policy printed on receipts', summary: (p) => short(p.receiptHeaderTagline, 28) },
        { id: 'attendance', icon: 'clock', title: 'Staff attendance', description: 'Grace period before an arrival counts as late', summary: (p) => (p.attendanceGraceMinutes ? `${p.attendanceGraceMinutes} min grace` : 'No grace period') },
        ...(isStoreManager ? [{ id: 'discounts', icon: 'receipt', title: 'Discount limits', description: 'Highest discount each cashier can give', summary: () => 'Open', href: '/admin/discount-limits' }] : []),
      ],
    });
  }

  // Warehouse roles: outgoing stock
  if (isWarehouse) {
    groups.push({
      id: 'warehouse', title: 'Warehouse & dispatch', description: 'Labels, carriers and checks for outgoing stock.',
      items: [
        { id: 'shipping', icon: 'truck', title: 'Shipping labels & carrier', description: 'Label size, carton details and delivery company', summary: (p) => `${p.shippingLabelFormat === '4x6' ? '4×6' : '2×1'} · ${p.defaultFreightCarrier}` },
        { id: 'checks', icon: 'shield', title: 'Damage & seal checks', description: 'Quarantine damaged stock and confirm truck seals', summary: (p) => countOn(p.damageAutoQuarantine, p.requireDriverSealConfirmation) },
      ],
    });
  }

  // Admin: company-wide rules and the admin pages
  if (isAdmin) {
    groups.push({
      id: 'company', title: 'Company rules', description: 'Rules that apply to every store and user.',
      items: [
        { id: 'governance', icon: 'shield', title: 'Security & audit rules', description: 'Store binding, audit lock, reasons for voids and password expiry', summary: (p) => `${countOn(p.enforceDualAxisBinding, p.strictAuditFreezeCheck, p.requireCancellationReason)} · ${p.passwordExpiryDays ? `${p.passwordExpiryDays}-day passwords` : 'No expiry'}` },
        { id: 'users', icon: 'user', title: 'User directory', description: 'Add people and set their roles', summary: () => 'Open', href: '/admin/users' },
        { id: 'company', icon: 'store', title: 'Company & locations', description: 'Company details, stores and warehouses', summary: () => 'Open', href: '/admin/company' },
        { id: 'discounts', icon: 'receipt', title: 'Discount limits', description: 'Highest discount each role can give', summary: () => 'Open', href: '/admin/discount-limits' },
        { id: 'sales', icon: 'grid', title: 'Sale permissions', description: 'Who can void, refund or override prices', summary: () => 'Open', href: '/admin/sales-permissions' },
      ],
    });
  }

  // Cashier and staff clock in with the QR code on the Staff Attendance page
  if (!(isStoreManager || isWarehouse || isAdmin)) {
    groups.push({
      id: 'shift', title: 'Shift & clock-in', description: 'Camera and reminders for clocking in.',
      items: [
        { id: 'shift', icon: 'clock', title: 'QR clock-in & reminders', description: 'Which camera to scan with and when to remind you', summary: (p) => `${p.qrCameraFacing === 'environment' ? 'Back' : 'Front'} camera · ${p.shiftReminderAdvanceMinutes} min before` },
      ],
    });
  }

  const alertKeys = getAlertKeys(role);
  groups.push({
    id: 'alerts',
    title: 'Notifications',
    description: 'Choose what you want to hear about.',
    items: [
      { id: 'notifications', icon: 'bell', title: 'Alerts', description: cap(alertKeys.map((k) => ALERTS[k].short).join(', ')), summary: (p) => countOn(...alertKeys.map((k) => p[k])) },
    ],
  });

  return groups;
}

// ---------- Alerts, shown only where they matter for the role ----------
type AlertKey = 'notifyLowStockEmail' | 'notifyShipmentDiscrepancies' | 'notifyShiftStart' | 'notifySalesRefunds';
const ALERTS: Record<AlertKey, { title: string; detail: string; short: string }> = {
  notifyLowStockEmail: { title: 'Low stock', detail: 'When an item reaches its low-stock level.', short: 'low stock' },
  notifyShipmentDiscrepancies: { title: 'Shipment problems', detail: 'Damaged cartons or items missing from a delivery.', short: 'shipment problems' },
  notifyShiftStart: { title: 'Shift reminders', detail: 'A reminder before the clock-in cut-off time.', short: 'shift reminders' },
  notifySalesRefunds: { title: 'Voids & refunds', detail: 'When a supervisor cancels a bill or approves a return.', short: 'voids & refunds' },
};
function getAlertKeys(role: string): AlertKey[] {
  if (role === 'CASHIER') return ['notifyShiftStart', 'notifySalesRefunds'];
  if (role === 'STAFF') return ['notifyShiftStart'];
  if (role === 'CENTRAL_MANAGER' || role === 'WAREHOUSE_MANAGER' || role === 'SUB_WAREHOUSE_MANAGER') return ['notifyLowStockEmail', 'notifyShipmentDiscrepancies'];
  return ['notifyLowStockEmail', 'notifyShipmentDiscrepancies', 'notifyShiftStart', 'notifySalesRefunds'];
}
function cap(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ---------- Panel content for each item ----------
export function SettingPanel({ id, role, prefs, onUpdate, onSaved }: { id: string; role: string; prefs: UserPreferences; onUpdate: UpdatePref; onSaved: (msg: string) => void }) {
  switch (id) {
    case 'password':
      return <PasswordPanel onSaved={onSaved} />;
    case 'pin':
      return <PinPanel onSaved={onSaved} />;

    case 'sound':
      return (
        <div className={styles.section}>
          <ToggleRow title="Sound effects & scan beep" detail="Play a short beep when a barcode is read, and a chime on warnings." checked={prefs.soundFxEnabled} onChange={(v) => onUpdate('soundFxEnabled', v)} />
          {prefs.soundFxEnabled && (
            <label className={styles.field}>
              <span>Beep volume <em className={styles.rangeValue}>{prefs.scanBeepVolume}%</em></span>
              <input className={styles.range} type="range" min={0} max={100} step={5} value={prefs.scanBeepVolume} onChange={(e) => onUpdate('scanBeepVolume', Number(e.target.value))} />
            </label>
          )}
          <ToggleRow title="Keyboard shortcut bar" detail="Show the F1, F8 and ESC hints along the bottom of the screen." checked={prefs.showKeyboardHints} onChange={(v) => onUpdate('showKeyboardHints', v)} />
        </div>
      );
    case 'region':
      return (
        <>
          <ChoiceList name="currency" label="Currency" options={CURRENCIES} value={prefs.currencySymbol} onChange={(v) => onUpdate('currencySymbol', v)} />
          <ChoiceList name="date" label="Date & time format" options={DATE_FORMATS} value={prefs.dateFormat} onChange={(v) => onUpdate('dateFormat', v)} />
        </>
      );
    case 'autolock':
      return (
        <>
          <ChoiceList name="lock" label="Lock the screen after" hint="Counted from the last tap, click or scan. Unlock with your PIN." options={LOCK_TIMES} value={prefs.autoLockMinutes} onChange={(v) => onUpdate('autoLockMinutes', v)} columns={2} />
          <div className={styles.infoBox}><Icon name="info" size={16} /><span>Locking keeps your account safe if you step away from the counter.</span></div>
        </>
      );

    case 'printer':
      return (
        <>
          <ChoiceList
            name="paper" label="Receipt paper width"
            options={[{ value: '80mm', label: '80 mm', detail: 'Standard counter printer' }, { value: '58mm', label: '58 mm', detail: 'Compact or mobile printer' }]}
            value={prefs.printerWidth} onChange={(v) => onUpdate('printerWidth', v)} columns={2}
          />
          <div className={styles.section}>
            <ToggleRow title="Print receipt after payment" detail="Print the receipt as soon as the sale is complete." checked={prefs.autoPrintReceipt} onChange={(v) => onUpdate('autoPrintReceipt', v)} />
            <ToggleRow title="Open cash drawer on cash sales" detail="The drawer pops open when a customer pays in cash." checked={prefs.cashDrawerAutoKick} onChange={(v) => onUpdate('cashDrawerAutoKick', v)} />
          </div>
        </>
      );
    case 'scanner':
      return (
        <>
          <ChoiceList
            name="scanner" label="How you scan barcodes"
            options={[{ value: 'hardware', label: 'Handheld scanner', detail: 'USB or Bluetooth barcode gun' }, { value: 'camera', label: 'Device camera', detail: 'Use the tablet or laptop camera' }]}
            value={prefs.scannerMode} onChange={(v) => onUpdate('scannerMode', v)} columns={2}
          />
          <div className={styles.section}>
            <ToggleRow title="Scanning again adds one more" detail="Scanning an item already in the cart raises its quantity by 1." checked={prefs.incrementOnRescan} onChange={(v) => onUpdate('incrementOnRescan', v)} />
            <ToggleRow title="Print store logo on receipts" detail="Adds the company logo at the top of each receipt." checked={prefs.printStoreLogo} onChange={(v) => onUpdate('printStoreLogo', v)} />
          </div>
        </>
      );
    case 'fastcash':
      return <FastCashPanel values={prefs.fastCashButtons} onChange={(v) => onUpdate('fastCashButtons', v)} />;
    case 'attendance':
      return (
        <>
          <ChoiceList
            name="grace" label="Grace period after shift start"
            hint="Staff who clock in within this time are still counted as on time."
            options={[{ value: 0, label: 'None', detail: 'Late from the first minute' }, { value: 5, label: '5 minutes' }, { value: 10, label: '10 minutes' }, { value: 15, label: '15 minutes', detail: 'Standard' }, { value: 30, label: '30 minutes' }]}
            value={prefs.attendanceGraceMinutes} onChange={(v) => onUpdate('attendanceGraceMinutes', v)} columns={2}
          />
          <div className={styles.infoBox}>
            <Icon name="info" size={16} />
            <span>The shift start time and the QR code rule are set per store on the Attendance Oversight page, under &quot;Shift &amp; QR&quot;.</span>
          </div>
          <a className={styles.linkRow} href="/attendance/manage"><Icon name="external" size={15} /> Open Attendance Oversight</a>
        </>
      );

    case 'stock':
      return (
        <>
          <NumberField label="Low stock warning" hint="You get a warning when an item has this many units or fewer on the shelf." value={prefs.lowStockBuffer} min={1} max={100} unit="units" onChange={(v) => onUpdate('lowStockBuffer', v)} />
          <NumberField label="Cash drawer limit" hint="When a drawer holds more than this, the cashier is asked to move cash to the safe." value={prefs.drawerFloatLimitWarning} min={0} step={5000} unit="₹" onChange={(v) => onUpdate('drawerFloatLimitWarning', v)} />
          <div className={styles.section}>
            <ToggleRow title="Warn about negative stock" detail="Highlight items whose stock count drops below zero, so they can be checked." checked={prefs.negativeStockAlert} onChange={(v) => onUpdate('negativeStockAlert', v)} />
            <ToggleRow title="Print shift summary (Z-report)" detail="Print a sales summary automatically when a shift ends." checked={prefs.autoGenerateShiftReport} onChange={(v) => onUpdate('autoGenerateShiftReport', v)} />
          </div>
        </>
      );
    case 'receipt':
      return (
        <>
          <label className={styles.field}>
            <span>Top line (tagline)</span>
            <input type="text" value={prefs.receiptHeaderTagline} maxLength={80} onChange={(e) => onUpdate('receiptHeaderTagline', e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Bottom line (return policy)</span>
            <input type="text" value={prefs.receiptFooterReturnPolicy} maxLength={120} onChange={(e) => onUpdate('receiptFooterReturnPolicy', e.target.value)} />
          </label>
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Preview</p>
            <div className={styles.receipt}>
              <b>Premium Retail</b>
              <div>{prefs.receiptHeaderTagline || ' '}</div>
              <hr />
              <div className={styles.receiptLine}><span>1 × Sample item</span><span>₹499.00</span></div>
              <div className={styles.receiptLine}><span>Total</span><span>₹499.00</span></div>
              <hr />
              <div>{prefs.receiptFooterReturnPolicy || ' '}</div>
            </div>
          </div>
        </>
      );

    case 'shipping':
      return (
        <>
          <ChoiceList
            name="label" label="Default label size"
            options={[{ value: '4x6', label: '4" × 6"', detail: 'Pallets and freight manifests' }, { value: '2x1', label: '2" × 1"', detail: 'Carton and shelf barcodes' }]}
            value={prefs.shippingLabelFormat} onChange={(v) => onUpdate('shippingLabelFormat', v)} columns={2}
          />
          <ToggleRow title="Show carton breakdown on labels" detail="Print how many cartons and units are in each package on the label." checked={prefs.includeCartonBreakdownOnLabels} onChange={(v) => onUpdate('includeCartonBreakdownOnLabels', v)} />
          <ChoiceList name="carrier" label="Default carrier" options={CARRIERS} value={prefs.defaultFreightCarrier} onChange={(v) => onUpdate('defaultFreightCarrier', v)} columns={2} />
        </>
      );
    case 'checks':
      return (
        <div className={styles.section}>
          <ToggleRow title="Quarantine damaged goods" detail="Damaged units are set aside straight away so they can't be sold or sent." checked={prefs.damageAutoQuarantine} onChange={(v) => onUpdate('damageAutoQuarantine', v)} />
          <ToggleRow title="Confirm the truck seal" detail="The driver's seal number must be recorded before a dispatch leaves." checked={prefs.requireDriverSealConfirmation} onChange={(v) => onUpdate('requireDriverSealConfirmation', v)} />
        </div>
      );

    case 'governance':
      return (
        <div className={styles.section}>
          <ToggleRow title="Keep users at their assigned store" detail="People can only sign in and sell at the location they are assigned to." checked={prefs.enforceDualAxisBinding} onChange={(v) => onUpdate('enforceDualAxisBinding', v)} />
          <ToggleRow title="Pause sales during a stock count" detail="Checkout is locked at a store while its stock audit is running." checked={prefs.strictAuditFreezeCheck} onChange={(v) => onUpdate('strictAuditFreezeCheck', v)} />
          <ToggleRow title="Ask for a reason on voids and refunds" detail="A supervisor must type a reason, and it is saved in the audit log." checked={prefs.requireCancellationReason} onChange={(v) => onUpdate('requireCancellationReason', v)} />
          <ChoiceList
            name="expiry" label="Ask users to change their password every"
            options={[{ value: 30, label: '30 days' }, { value: 60, label: '60 days' }, { value: 90, label: '90 days', detail: 'Standard' }, { value: 180, label: '180 days' }, { value: 0, label: 'Never' }]}
            value={prefs.passwordExpiryDays} onChange={(v) => onUpdate('passwordExpiryDays', v)} columns={2}
          />
        </div>
      );

    case 'shift':
      return (
        <>
          <ChoiceList
            name="camera" label="Camera for QR clock-in"
            options={[{ value: 'environment', label: 'Back camera', detail: 'Usual choice on a phone' }, { value: 'user', label: 'Front camera', detail: 'Laptop or kiosk screen' }]}
            value={prefs.qrCameraFacing} onChange={(v) => onUpdate('qrCameraFacing', v)} columns={2}
          />
          <ChoiceList
            name="reminder" label="Remind me before my shift"
            options={[{ value: 15, label: '15 minutes before' }, { value: 30, label: '30 minutes before', detail: 'Recommended' }, { value: 60, label: '1 hour before' }]}
            value={prefs.shiftReminderAdvanceMinutes} onChange={(v) => onUpdate('shiftReminderAdvanceMinutes', v)}
          />
        </>
      );

    case 'notifications':
      return (
        <div className={styles.section}>
          {getAlertKeys(role).map((k) => (
            <ToggleRow key={k} title={ALERTS[k].title} detail={ALERTS[k].detail} checked={prefs[k]} onChange={(v) => onUpdate(k, v)} />
          ))}
        </div>
      );
    default:
      return null;
  }
}

// ---------- Password ----------
function PasswordPanel({ onSaved }: { onSaved: (msg: string) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const longEnough = next.length >= 8;
  const matches = next.length > 0 && next === confirm;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!current) return setError('Enter your current password.');
    if (!longEnough) return setError('The new password needs at least 8 characters.');
    if (!matches) return setError('The two new passwords do not match.');
    setError('');
    setCurrent(''); setNext(''); setConfirm('');
    onSaved('Password updated.');
  };

  return (
    <form id="settings-form" className={styles.section} onSubmit={submit}>
      <label className={styles.field}>
        <span>Current password</span>
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span>New password</span>
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className={styles.field}>
        <span>Type the new password again</span>
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <ul className={styles.checks}>
        <li className={longEnough ? styles.checkOk : ''}><Icon name="check" size={14} /> At least 8 characters</li>
        <li className={matches ? styles.checkOk : ''}><Icon name="check" size={14} /> Both new passwords match</li>
      </ul>
      {error && <p className={styles.error}><Icon name="alert" size={15} /> {error}</p>}
    </form>
  );
}

// ---------- Quick unlock PIN ----------
function PinPanel({ onSaved }: { onSaved: (msg: string) => void }) {
  const [pin, setPin] = useState('1234');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return setError('The PIN must be exactly 4 digits (0-9).');
    setError('');
    onSaved('Unlock PIN saved.');
  };

  return (
    <form id="settings-form" className={styles.section} onSubmit={submit}>
      <label className={styles.field}>
        <span>4-digit PIN</span>
        <input
          className={styles.pinInput} type="password" inputMode="numeric" maxLength={4} autoComplete="off"
          value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        <small>Numbers only. Avoid easy ones like 0000 or your birthday.</small>
      </label>
      {error && <p className={styles.error}><Icon name="alert" size={15} /> {error}</p>}
      <div className={styles.infoBox}>
        <Icon name="info" size={16} />
        <span>When the screen locks, type this PIN to carry on where you left off. You don&apos;t need to sign in again with your email and password.</span>
      </div>
    </form>
  );
}

// ---------- Quick cash buttons ----------
const NOTE_PRESETS = [10, 20, 50, 100, 200, 500, 2000];
function FastCashPanel({ values, onChange }: { values: number[]; onChange: (v: number[]) => void }) {
  const toggle = (note: number) => {
    const has = values.includes(note);
    if (has && values.length <= 1) return; // keep at least one button
    if (!has && values.length >= 6) return; // the payment screen has room for six
    onChange((has ? values.filter((v) => v !== note) : [...values, note]).sort((a, b) => a - b));
  };
  return (
    <>
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Notes to show</p>
        <p className={styles.sectionHint}>Pick 1 to 6 amounts. Tapping one fills in the cash received in one go.</p>
        <div className={styles.noteGrid}>
          {NOTE_PRESETS.map((n) => (
            <button key={n} type="button" aria-pressed={values.includes(n)} className={`${styles.note} ${values.includes(n) ? styles.noteOn : ''}`} onClick={() => toggle(n)}>
              ₹{n.toLocaleString('en-IN')}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.section}>
        <p className={styles.sectionLabel}>How it looks at checkout</p>
        <div className={styles.cashPreview}>
          <small>Cash received</small>
          <div>{values.map((v) => <span key={v}>₹{v.toLocaleString('en-IN')}</span>)}</div>
        </div>
      </div>
    </>
  );
}

/** Items whose panel is a form with its own Save button */
export const FORM_ITEMS: Record<string, string> = { password: 'Update password', pin: 'Save PIN' };
