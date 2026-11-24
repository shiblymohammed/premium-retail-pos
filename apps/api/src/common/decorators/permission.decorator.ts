import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'pos-permission';
export const RESTRICTED_PERMISSION_KEY = 'pos-restricted-permission';

export const PERMISSIONS = {
  'sales.checkout': 'Create sales',
  'sales.receipts': 'View and reprint receipts',
  'sales.reports': 'View sales reports',
  'cash.drawer': 'Open and close own cash drawer',
  'cash.reports': 'View cash settlement reports',
  'stock.view': 'View stock and stock movement reports',
  'stock.intake': 'Record opening stock',
  'stock.auditManagement': 'Start, review and approve stock counts',
  'products.prices': 'Change shared catalogue prices',
  'products.cost': 'See product cost',
  'transfers.request': 'Request stock transfers',
  'transfers.approve': 'Approve, reject and cancel transfers',
  'transfers.dispatch': 'Confirm packing and dispatch transfers',
  'transfers.receive': 'Accept stock transfers',
  'purchasing.orders': 'Create purchase orders and confirm goods receipts',
  'purchasing.payments': 'Record supplier payments',
  'customers.credit': 'Manage customer credit',
  'staff.view': 'View staff and attendance',
  'staff.manage': 'Add and edit outlet staff',
  'attendance.manage': 'Set shift hours and correct time records',
  'payroll.view': 'View staff salary and payroll',
  'payroll.manage': 'Create payroll and record payment',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export type PermissionOverrides = Partial<Record<PermissionKey, boolean>>;

export const RestrictedPermission = (permission: PermissionKey) => SetMetadata(RESTRICTED_PERMISSION_KEY, permission);

export const Permission = (...permissions: PermissionKey[]) => SetMetadata(PERMISSION_KEY, permissions);

export function permissionOverride(actor: { role: string; permissionOverrides?: PermissionOverrides }, key: PermissionKey) {
  return actor.role === 'SUPER_ADMIN' ? true : actor.permissionOverrides?.[key];
}

export function can(actor: { role: string; permissionOverrides?: PermissionOverrides }, key: PermissionKey, roleDefault: boolean) {
  return permissionOverride(actor, key) ?? roleDefault;
}
