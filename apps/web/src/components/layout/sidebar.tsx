'use client';

import {
  ArrowLeftRight,
  Banknote,
  Building2,
  ChartNoAxesColumn,
  ClipboardCheck,
  CalendarClock,
  ContactRound,
  ReceiptText,
  Clock,
  LayoutDashboard,
  LogOut,
  Monitor,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Percent,
  Settings,
  ShoppingBag,
  ShieldCheck,
  Store,
  Undo2,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NavGroup } from './nav-data';
import { ThemeControl } from './theme-control';

export interface SidebarProps {
  homeRoute: string;
  visibleGroups: NavGroup[];
  pathname: string;
  onNavigate: () => void;
  collapsed: boolean;
  toggleSidebar: () => void;
  handleSignOut: () => void;
}

/** Simple, bold retail/workspace symbols; each key maps to a navigation task. */
const ICON_COMPONENTS: Partial<Record<string, LucideIcon>> = {
  pos: Monitor,
  dashboard: LayoutDashboard,
  reports: ChartNoAxesColumn,
  products: Package,
  purchasing: ShoppingBag,
  audits: ClipboardCheck,
  transfers: ArrowLeftRight,
  returns: Undo2,
  oversight: CalendarClock,
  attendance: Clock,
  loans: Banknote,
  settings: Settings,
  users: UsersRound,
  staffRecords: ContactRound,
  payslip: ReceiptText,
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
  homeRoute,
  visibleGroups,
  pathname,
  onNavigate,
  collapsed,
  toggleSidebar,
  handleSignOut,
}) => {
  const router = useRouter();
  const activeHref = visibleGroups
    .flatMap((group) => group.links)
    .filter((link) => pathname === link.href || (link.href !== '/' && pathname.startsWith(`${link.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <aside id="workspace-navigation" className="drive-sidebar" aria-label="Application sidebar">
      <div className="workspace-brand-row">
      <Link className="drive-sidebar-brand" href={homeRoute} onClick={onNavigate} aria-label="Premium Retail workspace">
        <span className="drive-sidebar-brand-icon"><NavIcon name="brand" size={22} /></span>
        <span className="workspace-brand-name">Premium Retail</span>
      </Link>
      <button type="button" className="drive-icon-button workspace-sidebar-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} onClick={toggleSidebar} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {collapsed ? <PanelLeftOpen size={19} aria-hidden="true" /> : <PanelLeftClose size={19} aria-hidden="true" />}
      </button>
      <button id="mobile-nav-close" className="drive-icon-button workspace-nav-close" type="button" aria-label="Close navigation" onClick={onNavigate}>
        <X size={20} aria-hidden="true" />
      </button>
      </div>

      <ThemeControl />
      <nav className="drive-nav-list" aria-label="Main navigation">
        {visibleGroups.map((group) => (
          <div key={group.title} className="drive-nav-group" role="group" aria-label={group.title}>
            <div className="workspace-nav-caption" aria-hidden="true">{group.title}</div>
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
                  onClick={onNavigate}
                  className={`drive-nav-item${active ? ' active' : ''}`}
                  title={link.label}
                  aria-label={link.label}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="drive-nav-icon">
                    <NavIcon name={link.icon} />
                  </span>
                  <span className="drive-nav-label">{link.label}</span>
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
          <span className="drive-nav-label">Sign out</span>
        </button>
      </div>

    </aside>
  );
};
