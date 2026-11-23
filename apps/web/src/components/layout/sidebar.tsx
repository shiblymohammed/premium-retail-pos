'use client';

import {
  ArrowLeftRight,
  Banknote,
  Building2,
  ChartNoAxesColumn,
  ClipboardCheck,
  Clock,
  LayoutDashboard,
  LogOut,
  Monitor,
  Package,
  Percent,
  Settings,
  ShieldCheck,
  Store,
  Undo2,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
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
const ICON_COMPONENTS: Partial<Record<string, LucideIcon>> = {
  pos: Monitor,
  dashboard: LayoutDashboard,
  reports: ChartNoAxesColumn,
  products: Package,
  audits: ClipboardCheck,
  transfers: ArrowLeftRight,
  returns: Undo2,
  oversight: UsersRound,
  attendance: Clock,
  loans: Banknote,
  settings: Settings,
  users: UsersRound,
  company: Building2,
  discount: Percent,
  permissions: ShieldCheck,
  logout: LogOut,
  brand: Store,
};

export function NavIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Glyph = ICON_COMPONENTS[name] ?? LayoutDashboard;
  return <Glyph size={size} strokeWidth={2.25} aria-hidden="true" />;
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
