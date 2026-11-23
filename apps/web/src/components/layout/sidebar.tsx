'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NavGroup } from './nav-data';

export interface SidebarProps {
  collapsed: boolean;
  homeRoute: string;
  visibleGroups: NavGroup[];
  pathname: string;
  handleSignOut: () => void;
}

/** Simple, bold retail/workspace symbols; each key maps to a navigation task. */
const ICON_PATHS: Record<string, React.ReactNode> = {
  pos: <><rect x="4" y="4" width="16" height="13" rx="2" /><path d="M8 21h8M12 17v4M8 9h8" /></>,
  dashboard: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  reports: <><path d="M4 20h16M7 16v-4M12 16V6M17 16V9" /></>,
  products: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  audits: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M8.5 13l2.3 2.3 4.7-5" /></>,
  transfers: <><path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4" /></>,
  returns: <><path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12h-2" /></>,
  oversight: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5" /></>,
  attendance: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
  loans: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5v5M17.5 9.5v5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 5M17 15a5 5 0 0 1 4 5" /></>,
  company: <><path d="M4 20V8l8-4 8 4v12M2 20h20M9 20v-5h6v5M8 10h.01M16 10h.01" /></>,
  discount: <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
  permissions: <><path d="M12 3 20 6v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /><path d="m9 12 2 2 4-4" /></>,
  logout: <><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H3" /></>,
  brand: <><path d="M3 10h18l-2-6H5zM5 10v10h14V10M9 20v-6h6v6" /><path d="M3 10a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 2 0" /></>,
};

export function NavIcon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name] || ICON_PATHS.dashboard}
    </svg>
  );
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  homeRoute,
  visibleGroups,
  pathname,
  handleSignOut,
}) => {
  const router = useRouter();
  const activeHref = visibleGroups
    .flatMap((group) => group.links)
    .filter((link) => pathname === link.href || (link.href !== '/' && pathname.startsWith(`${link.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <aside className="drive-sidebar" aria-label="Application sidebar">
      {/* Brand */}
      <Link className="drive-sidebar-brand" href={homeRoute} aria-label="Premium Retail workspace">
        <span className="drive-sidebar-brand-icon"><NavIcon name="brand" size={22} /></span>
        {!collapsed && <span>Premium Retail</span>}
      </Link>

      {/* Navigation Links, groups separated by a thin divider like the reference */}
      <nav className="drive-nav-list" aria-label="Main navigation">
        {visibleGroups.map((group) => (
          <div key={group.title} className="drive-nav-group" role="group" aria-label={group.title}>
            {group.links.map((link) => {
              const active = activeHref === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  // Warm only the destination the user is about to open instead
                  // of fetching every route just because all sidebar links are visible.
                  prefetch={false}
                  onMouseEnter={() => router.prefetch(link.href)}
                  onFocus={() => router.prefetch(link.href)}
                  className={`drive-nav-item${active ? ' active' : ''}`}
                  title={link.label}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="drive-nav-icon">
                    <NavIcon name={link.icon} />
                  </span>
                  {!collapsed && <span className="drive-nav-label">{link.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}

      </nav>

      <div className="drive-sidebar-footer" role="group" aria-label="Session">
        <button type="button" className="drive-nav-item" onClick={handleSignOut} title="Sign out">
          <span className="drive-nav-icon">
            <NavIcon name="logout" />
          </span>
          {!collapsed && <span className="drive-nav-label">Sign out</span>}
        </button>
      </div>

    </aside>
  );
};
