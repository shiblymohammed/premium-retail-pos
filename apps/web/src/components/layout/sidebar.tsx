'use client';

import React from 'react';
import Link from 'next/link';
import { NavGroup } from './nav-data';

export interface SidebarProps {
  collapsed: boolean;
  homeRoute: string;
  visibleGroups: NavGroup[];
  pathname: string;
  handleSignOut: () => void;
}

/** Outline icons in the style of the reference sidebar. Keys match `NavLink.icon`. */
const ICON_PATHS: Record<string, React.ReactNode> = {
  pos: <><rect x="3.5" y="4" width="17" height="11" rx="2" /><path d="M8 20h8M12 15v5M7 8h5" /></>,
  dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
  reports: <><path d="M5 20V12M10 20V6M15 20v-9M20 20V9" /></>,
  products: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9" /></>,
  audits: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6" /></>,
  transfers: <><path d="M4 8h15M15 4l4 4-4 4M20 16H5m4-4-4 4 4 4" /></>,
  returns: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  oversight: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></>,
  attendance: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  loans: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5v5M17.5 9.5v5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></>,
  users: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  company: <><path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 11h.01M15 11h.01" /></>,
  discount: <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
  permissions: <><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5M12 14.5v2" /></>,
  logout: <><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H3" /></>,
  brand: <><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Z" /><path d="M9 9.5h6M9 12.5h4" /></>,
};

export function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
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

        <div className="drive-nav-group" role="group" aria-label="Session">
          <button type="button" className="drive-nav-item" onClick={handleSignOut} title="Sign out">
            <span className="drive-nav-icon">
              <NavIcon name="logout" />
            </span>
            {!collapsed && <span className="drive-nav-label">Sign out</span>}
          </button>
        </div>
      </nav>

    </aside>
  );
};
