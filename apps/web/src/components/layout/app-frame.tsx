'use client';

import { Lock, Menu } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  AuthSession,
  clearStoredSession,
  getStoredSession,
  getRoleHomeRoute,
  getJwtExpirationMs,
  refreshStoredSession,
  AUTH_CHANGE_EVENT,
} from '@/lib/auth';
import { ALL_NAV_GROUPS, LOCATION_KEY } from './nav-data';
import { WorkspaceTools } from './workspace-tools';
import { Sidebar } from './sidebar';
import { ThemeControl } from './theme-control';

export interface AppFrameLayoutProps {
  children: React.ReactNode;
}

export function AppFrameLayout({ children }: AppFrameLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [location, setLocation] = useState('All retail locations');
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [canCountStockAudits, setCanCountStockAudits] = useState(false);
  const [auditCapabilityLoaded, setAuditCapabilityLoaded] = useState(false);
  const [canAccessSaleControls, setCanAccessSaleControls] = useState(false);
  const [saleCapabilityLoaded, setSaleCapabilityLoaded] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('premium-retail-navigation') !== 'expanded');
    const storedLoc = window.localStorage.getItem(LOCATION_KEY);
    if (storedLoc) setLocation(storedLoc);
    let cancelled = false;

    // Close dropdowns on outside click
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.drive-location-wrap')) setIsLocationOpen(false);
      if (!target.closest('.drive-profile-wrap')) setIsProfileOpen(false);
    };

    // Listen for auth session changes and browser history navigation (back/forward)
    const handleAuthChange = (event: Event) => {
      const updated = (event as CustomEvent<AuthSession | null>).detail;
      setSession(updated);
      setSessionLoaded(true);
    };

    const handlePopState = () => {
      setSession(getStoredSession());
      setSessionLoaded(true);
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
    window.addEventListener('popstate', handlePopState);

    // Restore the session before mounting protected screens. Refresh tokens
    // are rotated by the API, so renew an expired/near-expiry access token here.
    const restoreSession = async () => {
      let restored = getStoredSession();
      const expiresAt = restored?.expiresAt ?? (restored ? getJwtExpirationMs(restored.accessToken) : undefined);
      if (restored?.refreshToken && expiresAt && expiresAt <= Date.now() + 60_000) {
        const refreshed = await refreshStoredSession(restored);
        if (refreshed) restored = refreshed;
        else if (expiresAt <= Date.now()) {
          await clearStoredSession();
          restored = null;
        }
      }
      if (!cancelled) {
        setSession(restored);
        setSessionLoaded(true);
      }
    };
    void restoreSession();

    return () => {
      cancelled = true;
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // Keep a long-running cashier/manager session alive. Retry briefly if the
  // refresh endpoint is temporarily unavailable, then expire only at JWT expiry.
  useEffect(() => {
    if (!session?.refreshToken) return;
    const expiresAt = session.expiresAt ?? getJwtExpirationMs(session.accessToken);
    if (!expiresAt) return;
    let timer: number;
    let cancelled = false;
    const refresh = async () => {
      const updated = await refreshStoredSession(session);
      if (updated || cancelled) return;
      if (Date.now() >= expiresAt) {
        await clearStoredSession();
        return;
      }
      timer = window.setTimeout(refresh, Math.min(30_000, Math.max(1_000, expiresAt - Date.now())));
    };
    timer = window.setTimeout(refresh, Math.max(0, expiresAt - Date.now() - 60_000));
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [session?.accessToken, session?.expiresAt, session?.refreshToken]);

  useEffect(() => {
    const publicRoute = pathname === '/' || pathname === '/operations' || pathname === '/login';
    if (!sessionLoaded || session || publicRoute) return;
    const returnUrl = `${pathname}${window.location.search}`;
    router.replace(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
  }, [pathname, router, session, sessionLoaded]);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) {
      setCanCountStockAudits(false);
      setAuditCapabilityLoaded(true);
      setCanAccessSaleControls(false);
      setSaleCapabilityLoaded(true);
      setLocationOptions([]);
      return;
    }
    let cancelled = false;
    setAuditCapabilityLoaded(false);
    setSaleCapabilityLoaded(false);
    const loadAuditCapability = async () => {
      try {
        const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
        const response = await fetch(`${apiBase}/audits/capabilities`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Could not load audit permissions');
        const result = await response.json();
        if (!cancelled) setCanCountStockAudits(result?.data?.canCount === true);
      } catch {
        if (!cancelled) setCanCountStockAudits(false);
      } finally {
        if (!cancelled) setAuditCapabilityLoaded(true);
      }
    };
    void loadAuditCapability();

    const loadSaleControlCapability = async () => {
      try {
        const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
        const response = await fetch(`${apiBase}/users/me/sales-permissions`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Could not load sale-control permissions');
        const result = await response.json();
        const permissions = result?.data;
        if (!cancelled) setCanAccessSaleControls(
          permissions?.canCancelSales === true || permissions?.canProcessReturns === true,
        );
      } catch {
        if (!cancelled) setCanAccessSaleControls(false);
      } finally {
        if (!cancelled) setSaleCapabilityLoaded(true);
      }
    };
    void loadSaleControlCapability();

    const loadLocations = async () => {
      try {
        const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
        const response = await fetch(`${apiBase}/locations?isActive=true`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Could not load authorized locations');
        const result = await response.json();
        const names = Array.isArray(result?.data)
          ? result.data.map((item: { name?: string }) => item.name).filter((name: unknown): name is string => typeof name === 'string')
          : [];
        if (cancelled) return;
        const canChooseAll = ['SUPER_ADMIN', 'ADMIN'].includes(session.user?.role || '');
        const options = [...(canChooseAll ? ['All retail locations'] : []), ...names];
        setLocationOptions(options);
        const stored = window.localStorage.getItem(LOCATION_KEY);
        const next = stored && options.includes(stored) ? stored : options[0] || '';
        setLocation(next);
        if (next) window.localStorage.setItem(LOCATION_KEY, next);
      } catch {
        if (!cancelled) setLocationOptions([]);
      }
    };
    void loadLocations();
    return () => { cancelled = true; };
  }, [session?.accessToken, session?.user?.role]);

  useEffect(() => {
    const handleLocationChange = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (locationOptions.includes(value)) setLocation(value);
    };
    window.addEventListener('premium-retail-location-change', handleLocationChange);
    return () => window.removeEventListener('premium-retail-location-change', handleLocationChange);
  }, [locationOptions]);

  const chooseLocation = (value: string) => {
    if (!locationOptions.includes(value)) return;
    setLocation(value);
    window.localStorage.setItem(LOCATION_KEY, value);
    window.dispatchEvent(new CustomEvent('premium-retail-location-change', { detail: value }));
  };

  const toggleSidebar = () =>
    setCollapsed((value) => {
      window.localStorage.setItem('premium-retail-navigation', value ? 'expanded' : 'compact');
      return !value;
    });

  useEffect(() => {
    if (!mobileNavOpen) return;
    const desktop = window.matchMedia('(min-width: 761px)');
    const focusToggle = () => requestAnimationFrame(() => document.getElementById('mobile-nav-toggle')?.focus());
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMobileNavOpen(false);
      focusToggle();
    };
    const handleResize = () => {
      if (desktop.matches) setMobileNavOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    desktop.addEventListener('change', handleResize);
    document.getElementById('mobile-nav-close')?.focus();
    return () => {
      document.removeEventListener('keydown', handleEscape);
      desktop.removeEventListener('change', handleResize);
    };
  }, [mobileNavOpen]);

  const closeMobileNavigation = () => {
    if (!mobileNavOpen) return;
    setMobileNavOpen(false);
    requestAnimationFrame(() => document.getElementById('mobile-nav-toggle')?.focus());
  };

  const handleSignOut = async () => {
    await clearStoredSession();
    window.location.replace('/login');
  };

  // If on login page, don't show the dashboard shell
  if (pathname === '/login') {
    return <>{children}<div className="signin-theme"><ThemeControl /></div></>;
  }

  const rawRole = session?.user?.role || 'STORE_MANAGER';
  const userRole = rawRole === 'CENTRAL_MANAGER' ? 'WAREHOUSE_MANAGER' : rawRole;
  const isSuperUser = rawRole === 'SUPER_ADMIN';
  const homeRoute = session ? getRoleHomeRoute(rawRole) : '/dashboard';

  const userInitials = (session?.user?.name || session?.user?.email || 'PR')
    .slice(0, 2)
    .toUpperCase();

  // Find if current route is governed by role constraints
  const findMatchingLink = () => {
    for (const group of ALL_NAV_GROUPS) {
      for (const link of group.links) {
        if (pathname === link.href || (link.href !== '/' && link.href !== '/dashboard' && pathname.startsWith(link.href))) {
          return link;
        }
      }
    }
    return null;
  };

  const matchingLink = findMatchingLink();
  // Loans & advances were deferred by the client; keep the old route hidden as well as unlinked.
  const isDeferredRoute = pathname === '/attendance/loans' || pathname.startsWith('/attendance/loans/');
  const hasStandardRouteRole = Boolean(matchingLink && (
    matchingLink.roles.includes(rawRole) ||
    matchingLink.roles.includes(userRole) ||
    (isSuperUser && matchingLink.href !== '/')
  ));
  const isFeatureRouteAuthorized = matchingLink?.href === '/audits' && (rawRole === 'CASHIER' || rawRole === 'STAFF')
    ? auditCapabilityLoaded && canCountStockAudits
    : matchingLink?.href === '/sales-controls'
      ? saleCapabilityLoaded && (isSuperUser || canAccessSaleControls)
      : hasStandardRouteRole;
  const isAuthorizationPending = Boolean(session && (
    (matchingLink?.href === '/audits' && (rawRole === 'CASHIER' || rawRole === 'STAFF') && !auditCapabilityLoaded) ||
    (matchingLink?.href === '/sales-controls' && !saleCapabilityLoaded)
  ));
  const isAuthorized = !isDeferredRoute && (session
    ? matchingLink ? isFeatureRouteAuthorized : true
    : sessionLoaded && (pathname === '/operations' || pathname === '/'));

  // Filter links visible strictly to current role
  const visibleGroups = sessionLoaded && session
    ? ALL_NAV_GROUPS
        .map((group) => ({
          ...group,
          links: group.links.filter(
            (link) => (link.roles.includes(rawRole) || link.roles.includes(userRole)) &&
              (link.href !== '/audits' || (rawRole !== 'CASHIER' && rawRole !== 'STAFF') || (auditCapabilityLoaded && canCountStockAudits)) &&
              (link.href !== '/sales-controls' || (saleCapabilityLoaded && (isSuperUser || canAccessSaleControls)))
          ),
        }))
        .filter((group) => group.links.length > 0)
    : [];

  return (
    <div className={`app-frame${collapsed ? ' is-collapsed' : ''}${mobileNavOpen ? ' is-navigation-open' : ''}`}>
      {mobileNavOpen && <button className="workspace-nav-backdrop" type="button" tabIndex={-1} aria-label="Close navigation" onClick={closeMobileNavigation} />}
      <Sidebar
        homeRoute={homeRoute}
        visibleGroups={visibleGroups}
        pathname={pathname}
        onNavigate={closeMobileNavigation}
        handleSignOut={handleSignOut}
        collapsed={collapsed}
        toggleSidebar={toggleSidebar}
      />

      <div className="drive-body-container" inert={mobileNavOpen}>
        <header className="workspace-utility-row" aria-label="Workspace utilities">
          <button id="mobile-nav-toggle" type="button" className="drive-icon-button workspace-nav-toggle" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}>
            <Menu size={21} aria-hidden="true" />
          </button>
          {session && (
            <WorkspaceTools
              key={pathname}
              location={location}
              locationOptions={locationOptions}
              isLocationOpen={isLocationOpen}
              setIsLocationOpen={setIsLocationOpen}
              chooseLocation={chooseLocation}
              session={session}
              userInitials={userInitials}
              rawRole={rawRole}
              isProfileOpen={isProfileOpen}
              setIsProfileOpen={setIsProfileOpen}
              handleSignOut={handleSignOut}
              links={visibleGroups.flatMap((group) => group.links)}
            />
          )}
        </header>
        {/* Content Canvas */}
        <main className="drive-main-canvas">
          {!sessionLoaded ? (
            <div style={{ padding: '40px 24px', color: 'var(--retail-muted)', fontSize: '13px', textAlign: 'center' }}>
              Loading your account…
            </div>
          ) : !session && pathname !== '/' && pathname !== '/operations' ? (
            <div style={{ padding: '40px 24px', color: 'var(--retail-muted)', fontSize: '13px', textAlign: 'center' }} role="status">
              Your session has expired. Returning to sign in…
            </div>
          ) : isAuthorizationPending ? (
            <div style={{ padding: '40px 24px', color: 'var(--retail-muted)', fontSize: '13px', textAlign: 'center' }} role="status">
              Checking your access…
            </div>
          ) : isAuthorized ? (
            children
          ) : (
            <div
              style={{
                padding: '60px 24px',
                maxWidth: '520px',
                margin: '60px auto',
                background: 'var(--retail-card)',
                borderRadius: '14px',
                border: '1px solid var(--retail-edge-strong)',
                textAlign: 'center',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '12px' }}><Lock size="1em" className="inline-icon" aria-hidden="true" /></div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--retail-ink)', margin: '0 0 8px' }}>
                Restricted Operational Zone
              </h2>
              <p style={{ color: 'var(--retail-muted)', fontSize: '13.5px', lineHeight: 1.5, margin: '0 0 20px' }}>
                Your current role (<strong>{rawRole.replace('_', ' ')}</strong>) does not have access permissions for this workspace module.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <a
                  href={homeRoute}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    background: 'var(--retail-accent-strong)',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  Return to Dashboard
                </a>
                <a
                  href="/login"
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    background: 'var(--retail-edge)',
                    color: 'var(--retail-ink)',
                    fontSize: '13px',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  Switch Role
                </a>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default AppFrameLayout;
