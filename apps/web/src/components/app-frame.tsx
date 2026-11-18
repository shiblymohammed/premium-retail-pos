'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  AuthSession,
  clearStoredSession,
  getStoredSession,
  AUTH_CHANGE_EVENT,
} from '@/lib/auth';

const allNavGroups = [
  {
    title: 'OVERVIEW',
    links: [
      { label: 'Dashboard', href: '/dashboard', icon: '▦', roles: ['SUPER_ADMIN', 'STORE_MANAGER', 'WAREHOUSE_MANAGER'] },
      { label: 'Sales & POS', href: '/', icon: '▣', roles: ['SUPER_ADMIN', 'STORE_MANAGER', 'CASHIER'] },
      { label: 'Reports', href: '/reports', icon: '▤', roles: ['SUPER_ADMIN', 'STORE_MANAGER'] },
    ],
  },
  {
    title: 'INVENTORY',
    links: [
      { label: 'Products & Inventory', href: '/products', icon: '◇', roles: ['SUPER_ADMIN', 'STORE_MANAGER', 'WAREHOUSE_MANAGER'] },
      { label: 'Stock Audits', href: '/audits', icon: '◫', roles: ['SUPER_ADMIN', 'STORE_MANAGER', 'WAREHOUSE_MANAGER'] },
    ],
  },
  {
    title: 'OPERATIONS',
    links: [
      { label: 'Transfers & Warehouse', href: '/operations', icon: '⇄', roles: ['SUPER_ADMIN', 'STORE_MANAGER', 'WAREHOUSE_MANAGER'] },
      { label: 'Returns & Cancellations', href: '/sales-controls', icon: '↩', roles: ['SUPER_ADMIN', 'STORE_MANAGER'] },
    ],
  },
  {
    title: 'WORKFORCE',
    links: [
      { label: 'Staff Attendance', href: '/attendance', icon: '◷', roles: ['SUPER_ADMIN', 'STORE_MANAGER', 'CASHIER', 'WAREHOUSE_MANAGER'] },
      { label: 'Attendance Management', href: '/attendance/manage', icon: '♙', roles: ['SUPER_ADMIN', 'STORE_MANAGER'] },
    ],
  },
  {
    title: 'SETTINGS',
    links: [
      { label: 'Discount Limits', href: '/admin/discount-limits', icon: '◇', roles: ['SUPER_ADMIN', 'STORE_MANAGER'] },
      { label: 'Sale Permissions', href: '/admin/sales-permissions', icon: '⚿', roles: ['SUPER_ADMIN'] },
    ],
  },
];

const locations = ['All retail locations', 'Downtown Store', 'North Mall', 'West End Outlet', 'Central Warehouse'];
const LOCATION_KEY = 'premium-retail-location-scope';

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [location, setLocation] = useState('All retail locations');
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('premium-retail-sidebar-collapsed') === 'true');
    const storedLoc = window.localStorage.getItem(LOCATION_KEY);
    if (storedLoc && locations.includes(storedLoc)) setLocation(storedLoc);

    // Initial session load
    setSession(getStoredSession());

    // Listen for auth session changes across app
    const handleAuthChange = (event: Event) => {
      const updated = (event as CustomEvent<AuthSession | null>).detail;
      setSession(updated);
    };

    const handleLocationChange = (event: Event) => {
      const val = (event as CustomEvent<string>).detail;
      if (locations.includes(val)) setLocation(val);
    };

    window.addEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
    window.addEventListener('premium-retail-location-change', handleLocationChange);

    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, handleAuthChange);
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
    router.push('/login');
  };

  // If on login page, don't show the dashboard shell
  if (pathname === '/login') {
    return <>{children}</>;
  }

  const userRole = session?.user?.role || 'STORE_MANAGER';
  const userInitials = (session?.user?.name || session?.user?.email || 'PR')
    .slice(0, 2)
    .toUpperCase();

  // Filter links visible to the current role
  const visibleGroups = allNavGroups
    .map((group) => ({
      ...group,
      links: group.links.filter((link) => link.roles.includes(userRole) || userRole === 'SUPER_ADMIN'),
    }))
    .filter((group) => group.links.length > 0);

  return (
    <div className={`app-frame${collapsed ? ' is-collapsed' : ''}`}>
      <aside className="shared-sidebar" aria-label="Application sidebar">
        <div className="shared-brand-row">
          <a className="shared-brand" href="/dashboard" aria-label="Premium Retail dashboard">
            <span className="shared-brand-mark">P</span>
            {!collapsed && (
              <span className="shared-brand-copy">
                <strong>Premium Retail</strong>
                <small>RETAIL OPERATIONS</small>
              </span>
            )}
          </a>
          <button
            className="shared-collapse"
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        <label className="shared-location" title="Viewing location">
          <span className="shared-location-icon">⌖</span>
          {!collapsed && (
            <span className="shared-location-body">
              <small>VIEWING LOCATION</small>
              <select
                aria-label="Viewing location"
                value={location}
                onChange={(event) => chooseLocation(event.target.value)}
              >
                {locations.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </span>
          )}
          {collapsed && (
            <select
              className="shared-location-collapsed-select"
              aria-label="Viewing location"
              value={location}
              onChange={(event) => chooseLocation(event.target.value)}
            >
              {locations.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          )}
        </label>

        <nav className="shared-nav" aria-label="Main navigation">
          {visibleGroups.map((group) => (
            <section className="shared-nav-group" key={group.title}>
              {!collapsed && <h2>{group.title}</h2>}
              {group.links.map((link) => {
                const active =
                  link.href === '/'
                    ? pathname === '/'
                    : pathname === link.href ||
                      (link.href !== '/dashboard' && pathname.startsWith(`${link.href}/`));
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    className={`shared-nav-link${active ? ' active' : ''}`}
                    title={link.label}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="shared-nav-icon" aria-hidden="true">
                      {link.icon}
                    </span>
                    {!collapsed && <span>{link.label}</span>}
                  </a>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="shared-sidebar-footer">
          <span className="shared-footer-avatar">{userInitials}</span>
          {!collapsed && (
            <div style={{ display: 'grid', gap: '2px', flex: 1, minWidth: 0 }}>
              <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {session?.user?.name || session?.user?.email || 'Guest Operator'}
              </strong>
              <small style={{ color: '#9fb0c6', letterSpacing: '0.04em' }}>
                {session ? session.user.role.replace('_', ' ') : 'Not signed in'}
              </small>
              <div style={{ marginTop: '4px', display: 'flex', gap: '8px' }}>
                {session ? (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#f87171',
                      fontSize: '10px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    Sign out
                  </button>
                ) : (
                  <a
                    href="/login"
                    style={{
                      color: '#60a5fa',
                      fontSize: '10px',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Sign in →
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
      <div className="app-frame-content">{children}</div>
    </div>
  );
}
