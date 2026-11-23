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
let refreshInFlight: Promise<AuthSession | null> | null = null;

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function decodeJwt(token: string): Partial<AuthUser> | null {
  const parsed = decodeJwtPayload(token);
  if (parsed) {
    return {
      id: parsed.sub || parsed.id,
      email: parsed.email,
      role: parsed.role,
      locationIds: parsed.locationIds || [],
    };
  }
  return null;
}

export function getJwtExpirationMs(token: string): number | undefined {
  const exp = decodeJwtPayload(token)?.exp;
  return Number.isFinite(exp) ? Number(exp) * 1000 : undefined;
}

export function getStoredSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed || !parsed.accessToken) return null;
    // Discard malformed sessions left by older local mock-login builds.
    if (typeof parsed.accessToken !== 'string' || parsed.accessToken.split('.').length !== 3) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    const storedExpiresAt = parsed.expiresAt;
    // The API's JWT exp claim is authoritative. Older clients stored a shorter
    // fallback expiry, which incorrectly discarded otherwise valid sessions.
    const tokenExpiresAt = getJwtExpirationMs(parsed.accessToken);
    parsed.expiresAt = tokenExpiresAt ?? parsed.expiresAt;
    if (parsed.expiresAt && Date.now() >= parsed.expiresAt && !parsed.refreshToken) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    if (tokenExpiresAt && tokenExpiresAt !== storedExpiresAt) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Refresh the current session once, even if several screens request renewal together. */
export async function refreshStoredSession(current?: AuthSession | null): Promise<AuthSession | null> {
  if (refreshInFlight) return refreshInFlight;
  const session = current ?? getStoredSession();
  if (!session?.refreshToken) return null;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
        cache: 'no-store',
      });
      if (!response.ok) return null;
      const payload = await response.json();
      const accessToken = payload?.data?.accessToken;
      const refreshToken = payload?.data?.refreshToken;
      if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null;

      const claims = decodeJwt(accessToken);
      const expiresAt = getJwtExpirationMs(accessToken);
      if (!claims?.id || !claims.email || !claims.role || !expiresAt) return null;

      const updated: AuthSession = {
        accessToken,
        refreshToken,
        expiresAt,
        user: {
          ...session.user,
          id: claims.id,
          email: claims.email,
          role: claims.role,
          locationIds: claims.locationIds || [],
        },
      };
      setStoredSession(updated);
      return updated;
    } catch {
      return null;
    }
  })().finally(() => { refreshInFlight = null; });

  return refreshInFlight;
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
  if (!accessToken || accessToken.split('.').length !== 3) return;
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
