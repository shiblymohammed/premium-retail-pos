export type UserRole = 'SUPER_ADMIN' | 'STORE_MANAGER' | 'WAREHOUSE_MANAGER' | 'CASHIER' | string;

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
    role: 'CASHIER',
    label: 'Cashier',
    email: 'cashier@premiumretail.com',
    password: 'Cashier@123',
    name: 'Cashier Station 01',
    description: 'Fast barcode checkout, cash handling, attendance clock-in',
    homeRoute: '/',
  },
  {
    role: 'STORE_MANAGER',
    label: 'Store Manager',
    email: 'manager@premiumretail.com',
    password: 'Manager@123',
    name: 'Store Manager Downtown',
    description: 'Store KPIs, inventory reorders, punch approvals, return authorizations',
    homeRoute: '/dashboard',
  },
  {
    role: 'SUPER_ADMIN',
    label: 'Super Admin',
    email: 'admin@premiumretail.com',
    password: 'SuperAdmin@123',
    name: 'System Administrator',
    description: 'Full permission matrix, discount limits, multi-location audit approvals',
    homeRoute: '/admin/sales-permissions',
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

export async function clearStoredSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  const current = getStoredSession();
  if (current?.accessToken) {
    await revokeSession(current.accessToken);
  }
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT, { detail: null }));
  } catch {
    // Local storage clean fallback
  }
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
    case 'STORE_MANAGER':
      return '/dashboard';
    case 'WAREHOUSE_MANAGER':
      return '/operations';
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return '/admin/sales-permissions';
    default:
      return '/dashboard';
  }
}
