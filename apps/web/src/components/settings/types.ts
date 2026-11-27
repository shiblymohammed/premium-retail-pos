export type SettingsTab = 'general' | 'role-ops' | 'security' | 'notifications';

export interface UserPreferences {
  // General
  theme: 'light' | 'navy' | 'slate';
  soundFxEnabled: boolean;
  scanBeepVolume: number; // 0-100
  currencySymbol: string;
  dateFormat: string;
  autoLockMinutes: number; // 0 = never
  showKeyboardHints: boolean;

  // Cashier Hardware & Lane
  printerWidth: '80mm' | '58mm';
  autoPrintReceipt: boolean;
  printStoreLogo: boolean;
  cashDrawerAutoKick: boolean;
  fastCashButtons: number[];
  fastCashByCurrency: Record<string, number[]>;
  scannerMode: 'hardware' | 'camera';
  incrementOnRescan: boolean;

  // Store Manager Controls
  lowStockBuffer: number;
  negativeStockAlert: boolean;
  receiptHeaderTagline: string;
  receiptFooterReturnPolicy: string;
  drawerFloatLimitWarning: number;
  autoGenerateShiftReport: boolean;
  attendanceGraceMinutes: number;

  // Warehouse Logistics
  damageAutoQuarantine: boolean;
  shippingLabelFormat: '4x6' | '2x1';
  includeCartonBreakdownOnLabels: boolean;
  defaultFreightCarrier: string;
  requireDriverSealConfirmation: boolean;

  // Staff Preferences
  shiftReminderAdvanceMinutes: number;

  // Notifications
  notifyLowStockEmail: boolean;
  notifyShipmentDiscrepancies: boolean;
  notifyShiftStart: boolean;
  notifySalesRefunds: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'light',
  soundFxEnabled: true,
  scanBeepVolume: 80,
  currencySymbol: 'INR (₹)',
  dateFormat: 'DD-MMM-YYYY 12h',
  autoLockMinutes: 15,
  showKeyboardHints: true,

  printerWidth: '80mm',
  autoPrintReceipt: true,
  printStoreLogo: true,
  cashDrawerAutoKick: true,
  fastCashButtons: [100, 200, 500, 2000],
  fastCashByCurrency: {},
  scannerMode: 'hardware',
  incrementOnRescan: true,

  lowStockBuffer: 5,
  negativeStockAlert: true,
  receiptHeaderTagline: 'Premium Retail',
  receiptFooterReturnPolicy: 'Returns accepted within 14 days with original printed invoice.',
  drawerFloatLimitWarning: 50000,
  autoGenerateShiftReport: true,
  attendanceGraceMinutes: 15,

  damageAutoQuarantine: true,
  shippingLabelFormat: '4x6',
  includeCartonBreakdownOnLabels: true,
  defaultFreightCarrier: 'BlueDart Logistics',
  requireDriverSealConfirmation: true,

  shiftReminderAdvanceMinutes: 30,

  notifyLowStockEmail: true,
  notifyShipmentDiscrepancies: true,
  notifyShiftStart: true,
  notifySalesRefunds: true,
};

export const SETTINGS_STORAGE_PREFIX = 'premium-retail-settings-';

export function quickCashAmounts(currency: string, prefs: Partial<UserPreferences> = {}) {
  const configured = prefs.fastCashByCurrency?.[currency] ?? (currency === 'INR' ? prefs.fastCashButtons : undefined);
  const amounts = Array.isArray(configured) ? [...new Set(configured.filter((amount) => Number.isSafeInteger(amount) && amount > 0))] : [];
  return amounts.length ? amounts.sort((a, b) => a - b).slice(0, 6)
    : currency === 'INR' ? DEFAULT_PREFERENCES.fastCashButtons : [5, 10, 20, 50];
}
