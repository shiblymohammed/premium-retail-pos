export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'STORE_MANAGER'
  | 'CENTRAL_MANAGER'
  | 'WAREHOUSE_MANAGER'
  | 'SUB_WAREHOUSE_MANAGER'
  | 'CASHIER'
  | 'STAFF'
  | string;

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
  locationIds?: string[];
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
  expiresAt?: number;
}

export const SESSION_STORAGE_KEY = 'premium-retail-auth-session';
export const AUTH_CHANGE_EVENT = 'premium-retail-auth-change';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export const ROLE_PRESETS = [
  {
    role: 'SUPER_ADMIN',
    label: 'Super Admin',
    email: 'admin@premiumretail.com',
    password: 'SuperAdmin@123',
    name: 'System Administrator',
    description: 'Enterprise governance, company topology, global roles, system audit',
    homeRoute: '/dashboard',
  },
  {
    role: 'ADMIN',
    label: 'Admin',
    email: 'sysadmin@premiumretail.com',
    password: 'Admin@123',
    name: 'Regional Admin Director',
    description: 'User management, store provisioning, discount caps, sales permissions',
    homeRoute: '/admin/users',
  },
  {
    role: 'STORE_MANAGER',
    label: 'Store Manager',
    email: 'manager@premiumretail.com',
    password: 'Manager@123',
    name: 'Asha Patel',
    description: 'Store KPIs, inventory reorders, punch approvals, return authorizations',
    homeRoute: '/dashboard',
  },
  {
    role: 'CENTRAL_MANAGER',
    label: 'Central Warehouse',
    email: 'warehouse@premiumretail.com',
    password: 'Warehouse@123',
    name: 'Vikram Singh',
    description: 'Central hub logistics, supplier receiving, bulk stock dispatches',
    homeRoute: '/operations',
  },
  {
    role: 'SUB_WAREHOUSE_MANAGER',
    label: 'Sub Warehouse',
    email: 'subwarehouse@premiumretail.com',
    password: 'SubWarehouse@123',
    name: 'Rajesh Kumar',
    description: 'Regional depot transfers, store replenishment, local stock counts',
    homeRoute: '/operations',
  },
  {
    role: 'CASHIER',
    label: 'Cashier',
    email: 'cashier@premiumretail.com',
    password: 'Cashier@123',
    name: 'Ravi Menon',
    description: 'High-speed barcode checkout, cash handling, attendance clock-in',
    homeRoute: '/',
  },
  {
    role: 'STAFF',
    label: 'Staff Employee',
    email: 'staff@premiumretail.com',
    password: 'Staff@123',
    name: 'Priya Sharma',
    description: 'Floor staff check-in, rotating QR verification, salary advances',
    homeRoute: '/attendance',
  },
] as const;

export function decodeJwt(token: string): Partial<AuthUser> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonPayload);
    return {
      id: parsed.sub || parsed.id,
      email: parsed.email,
      role: parsed.role,
      locationIds: parsed.locationIds || [],
    };
  } catch {
    return null;
  }
}

export function getStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed || !parsed.accessToken) return null;
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredSession(session: AuthSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: session }));
  } catch {
    // Local storage write fallback
  }
}

export function clearStoredSession(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const current = getStoredSession();
  if (current?.accessToken) {
    void revokeSession(current.accessToken);
  }
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: null }));
  } catch {
    // Local storage clean fallback
  }
  return Promise.resolve();
}

export async function revokeSession(accessToken: string) {
  if (!accessToken || accessToken === 'demo_token') return;
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  } catch {
    // Local sign-out finishes even if API is offline
  }
}

export function getRoleHomeRoute(role?: string): string {
  switch (role) {
    case 'CASHIER':
      return '/';
    case 'STAFF':
      return '/attendance';
    case 'STORE_MANAGER':
      return '/dashboard';
    case 'CENTRAL_MANAGER':
    case 'WAREHOUSE_MANAGER':
    case 'SUB_WAREHOUSE_MANAGER':
      return '/operations';
    case 'ADMIN':
      return '/admin/users';
    case 'SUPER_ADMIN':
      return '/dashboard';
    default:
      return '/dashboard';
  }
}
