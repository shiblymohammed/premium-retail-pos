'use client';

import React from 'react';
import { AuthSession } from '@/lib/auth';
import { NavGroup } from './nav-data';

export interface SidebarProps {
  collapsed: boolean;
  primaryActionHref: string;
  primaryActionLabel: string;
  handleActionPillClick: (e: React.MouseEvent) => void;
  visibleGroups: NavGroup[];
  pathname: string;
  session: AuthSession | null;
  userInitials: string;
  rawRole: string;
  handleSignOut: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  primaryActionHref,
  primaryActionLabel,
  handleActionPillClick,
  visibleGroups,
  pathname,
  session,
  userInitials,
  rawRole,
  handleSignOut,
}) => {
  return (
    <aside className="drive-sidebar" aria-label="Application sidebar">
      {/* Top White Pill Action Button */}
      <a
        href={primaryActionHref}
        className="drive-action-pill"
        onClick={handleActionPillClick}
        title={primaryActionLabel}
      >
        <span className="drive-pill-plus" style={{ fontSize: '18px', fontWeight: 800 }}>+</span>
        {!collapsed && <span>{primaryActionLabel}</span>}
      </a>

      {/* Navigation Links */}
      <nav className="drive-nav-list" aria-label="Main navigation">
        {visibleGroups.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <div className="drive-nav-group-title">{group.title}</div>
            )}
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
                  className={`drive-nav-item${active ? ' active' : ''}`}
                  title={link.label}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="drive-nav-icon" aria-hidden="true">
                    {link.icon}
                  </span>
                  {!collapsed && <span>{link.label}</span>}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Session Footer */}
      {!collapsed && (
        <div
          style={{
            marginTop: '16px',
            paddingTop: '14px',
            borderTop: '1px solid rgba(255, 255, 255, 0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#ffffff',
              color: '#1a62ea',
              fontSize: '12.5px',
              fontWeight: 800,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            {userInitials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong
              style={{
                display: 'block',
                fontSize: '12.5px',
                color: '#ffffff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {session?.user?.name || session?.user?.email || 'Guest Operator'}
            </strong>
            <small style={{ display: 'block', fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.75)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {session ? rawRole.replace('_', ' ') : 'Not signed in'}
            </small>
            <div style={{ marginTop: '5px', display: 'flex', gap: '8px', fontSize: '11px' }}>
              <button
                type="button"
                onClick={handleSignOut}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#fca5a5',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Sign out
              </button>
              <span style={{ color: 'rgba(255, 255, 255, 0.35)' }}>•</span>
              <a
                href="/login"
                style={{
                  color: '#bfdbfe',
                  fontSize: '11px',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Switch Role
              </a>
              <span style={{ color: 'rgba(255, 255, 255, 0.35)' }}>•</span>
              <a
                href="/settings"
                style={{
                  color: '#e2e8f0',
                  fontSize: '11px',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Settings
              </a>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
