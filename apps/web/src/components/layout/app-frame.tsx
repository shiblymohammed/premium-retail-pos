'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  AuthSession,
  clearStoredSession,
  getStoredSession,
  getRoleHomeRoute,
  AUTH_CHANGE_EVENT,
} from '@/lib/auth';
import { ALL_NAV_GROUPS, LOCATIONS, LOCATION_KEY } from './nav-data';
import { TopBar } from './topbar';
import { Sidebar } from './sidebar';

export interface AppFrameLayoutProps {
  children: React.ReactNode;
}

export function AppFrameLayout({ children }: AppFrameLayoutProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [location, setLocation] = useState('All retail locations');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('premium-retail-sidebar-collapsed') === 'true');
    const storedLoc = window.localStorage.getItem(LOCATION_KEY);
    if (storedLoc && LOCATIONS.includes(storedLoc)) setLocation(storedLoc);

    // Initial session load
    setSession(getStoredSession());

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
    };

    const handlePopState = () => {
      setSession(getStoredSession());
    };

    const handleLocationChange = (event: Event) => {
      const val = (event as CustomEvent<string>).detail;
      if (LOCATIONS.includes(val)) setLocation(val);
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('premium-retail-location-change', handleLocationChange);

    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('premium-retail-location-change', handleLocationChange);
    };
  }, []);

  const chooseLocation = (value: string) => {
    setLocation(value);
    window.localStorage.setItem(LOCATION_KEY, value);
    window.dispatchEvent(new CustomEvent('premium-retail-location-change', { detail: value }));
  };

  const toggleSidebar = () =>
    setCollapsed((value) => {
      window.localStorage.setItem('premium-retail-sidebar-collapsed', String(!value));
      return !value;
    });

  const handleSignOut = async () => {
    await clearStoredSession();
    window.location.replace('/login');
  };

  // If on login page, don't show the dashboard shell
  if (pathname === '/login') {
    return <>{children}</>;
  }

  const rawRole = session?.user?.role || 'STORE_MANAGER';
  const userRole = rawRole === 'CENTRAL_MANAGER' ? 'WAREHOUSE_MANAGER' : rawRole;
  const isSuperUser = ['SUPER_ADMIN', 'ADMIN'].includes(rawRole);
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
  const isAuthorized =
    !session ||
    (matchingLink
      ? matchingLink.roles.includes(rawRole) ||
        matchingLink.roles.includes(userRole) ||
        (isSuperUser && matchingLink.href !== '/')
      : true);

  // Filter links visible strictly to current role
  const visibleGroups = ALL_NAV_GROUPS
    .map((group) => ({
      ...group,
      links: group.links.filter(
        (link) => link.roles.includes(rawRole) || link.roles.includes(userRole)
      ),
    }))
    .filter((group) => group.links.length > 0);

  const isLocationLocked = ['CASHIER', 'STAFF'].includes(rawRole);

  const primaryActionHref = pathname.startsWith('/admin/users')
    ? '#create-user'
    : isSuperUser
    ? '/admin/users'
    : homeRoute;

  const primaryActionLabel = pathname.startsWith('/admin/users')
    ? 'Provision New User'
    : isSuperUser
    ? 'Manage Directory'
    : 'Quick Workspace';

  const handleActionPillClick = (e: React.MouseEvent) => {
    if (pathname.startsWith('/admin/users')) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('open-user-modal'));
    }
  };

  return (
    <div className={`app-frame${collapsed ? ' is-collapsed' : ''}`}>
      {/* TopBar Component */}
      <TopBar
        homeRoute={homeRoute}
        location={location}
        isLocationLocked={isLocationLocked}
        isLocationOpen={isLocationOpen}
        setIsLocationOpen={setIsLocationOpen}
        chooseLocation={chooseLocation}
        session={session}
        userInitials={userInitials}
        rawRole={rawRole}
        isProfileOpen={isProfileOpen}
        setIsProfileOpen={setIsProfileOpen}
        handleSignOut={handleSignOut}
        collapsed={collapsed}
        toggleSidebar={toggleSidebar}
      />

      {/* Main Body */}
      <div className="drive-body-container">
        {/* Sidebar Component */}
        <Sidebar
          collapsed={collapsed}
          primaryActionHref={primaryActionHref}
          primaryActionLabel={primaryActionLabel}
          handleActionPillClick={handleActionPillClick}
          visibleGroups={visibleGroups}
          pathname={pathname}
          session={session}
          userInitials={userInitials}
          rawRole={rawRole}
          handleSignOut={handleSignOut}
        />

        {/* Content Canvas */}
        <main className="drive-main-canvas">
          {isAuthorized ? (
            children
          ) : (
            <div
              style={{
                padding: '60px 24px',
                maxWidth: '520px',
                margin: '60px auto',
                background: '#ffffff',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                textAlign: 'center',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
              }}
            >
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
                Restricted Operational Zone
              </h2>
              <p style={{ color: '#64748b', fontSize: '13.5px', lineHeight: 1.5, margin: '0 0 20px' }}>
                Your current role (<strong>{rawRole.replace('_', ' ')}</strong>) does not have access permissions for this workspace module.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <a
                  href={homeRoute}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    background: '#1a62ea',
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
                    background: '#f1f5f9',
                    color: '#334155',
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
