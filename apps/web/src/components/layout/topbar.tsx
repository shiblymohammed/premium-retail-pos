'use client';

import {
  ArrowLeftRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Lock,
  LogOut,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
} from 'lucide-react';
import React from 'react';
import { AuthSession } from '@/lib/auth';

export interface TopBarProps {
  homeRoute: string;
  location: string;
  locationOptions: string[];
  isLocationLocked: boolean;
  isLocationOpen: boolean;
  setIsLocationOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  chooseLocation: (loc: string) => void;
  session: AuthSession | null;
  userInitials: string;
  rawRole: string;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  handleSignOut: () => void;
  collapsed: boolean;
  toggleSidebar: () => void;
  /** Hide the global search on pages that provide their own (e.g. the dashboard). */
  showSearch?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  location,
  locationOptions,
  isLocationLocked,
  isLocationOpen,
  setIsLocationOpen,
  chooseLocation,
  session,
  userInitials,
  rawRole,
  isProfileOpen,
  setIsProfileOpen,
  handleSignOut,
  collapsed,
  toggleSidebar,
  showSearch = true,
}) => {
  return (
    <header className="drive-topbar" aria-label="Global navigation header">
      {/* Search (left, like the reference layout) */}
      {showSearch && (
      <div className="drive-search-pill" role="search">
        <Search size={18} aria-hidden="true" />
        <input
          type="text"
          placeholder="Search..."
          aria-label="Search across workspace"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const target = (e.target as HTMLInputElement).value;
              if (target) {
                window.location.href = `/admin/users?q=${encodeURIComponent(target)}`;
              }
            }
          }}
        />
      </div>
      )}

      <div className="drive-topbar-left">
        {/* Premium Custom Location Dropdown */}
        <div className="drive-location-wrap" style={{ position: 'relative' }}>
          <button
            type="button"
            className="drive-location-btn"
            onClick={() => {
              if (!isLocationLocked) setIsLocationOpen(!isLocationOpen);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '20px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              color: '#334155',
              fontSize: '12.5px',
              fontWeight: 650,
              cursor: isLocationLocked ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
            title={isLocationLocked ? 'Store location fixed to assigned terminal' : 'Switch viewing location scope'}
          >
            <span style={{ color: isLocationLocked ? '#64748b' : '#3e64a0', fontSize: '13px' }}>
              {isLocationLocked ? <Lock size="1em" className="inline-icon" aria-hidden="true" /> : <MapPin size="1em" className="inline-icon" aria-hidden="true" />}
            </span>
            <span className="drive-location-name">{location || 'Location unavailable'}</span>
            {!isLocationLocked && (
              <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '2px' }}><ChevronDown size="1em" className="inline-icon" aria-hidden="true" /></span>
            )}
          </button>

          {isLocationOpen && !isLocationLocked && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                width: '240px',
                background: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
                padding: '6px',
                zIndex: 200,
              }}
            >
              <div style={{ padding: '6px 10px', fontSize: '10.5px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                ACTIVE STORE SCOPE
              </div>
              {locationOptions.map((item) => {
                const isSelected = location === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      chooseLocation(item);
                      setIsLocationOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: isSelected ? '#eef3fa' : 'transparent',
                      color: isSelected ? '#3e64a0' : '#1e293b',
                      fontSize: '12.5px',
                      fontWeight: isSelected ? 700 : 550,
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: isSelected ? '#3e64a0' : '#94a3b8', fontSize: '13px' }}><MapPin size="1em" className="inline-icon" aria-hidden="true" /></span>
                      {item}
                    </span>
                    {isSelected && <span style={{ color: '#3e64a0', fontSize: '13px', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Workspace controls and account actions stay in distinct, aligned groups. */}
      <div className="drive-topbar-right">
        <div className="drive-header-tools" aria-label="Workspace tools">
          <button type="button" className="drive-icon-button" title="Notifications" aria-label="Notifications" onClick={() => alert('No new enterprise notifications.')}><Bell size="1em" className="inline-icon" aria-hidden="true" /></button>
          <button type="button" className="drive-icon-button" title="Help & Documentation" aria-label="Help" onClick={() => window.open('/operations', '_blank')}><CircleHelp size={18} aria-hidden="true" /></button>
          <a href="/settings" className="drive-icon-button" title="System Settings" aria-label="Settings" style={{ textDecoration: 'none' }}><Settings size="1em" className="inline-icon" aria-hidden="true" /></a>
        </div>
        <span className="drive-header-divider" aria-hidden="true" />

        {/* User Profile Pill & Dropdown Menu */}
        <div className="drive-profile-wrap" style={{ position: 'relative' }}>
          <button
            type="button"
            className="drive-profile-pill"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '4px 8px 4px 14px',
              borderRadius: '24px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              color: '#1e293b',
              fontSize: '13px',
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            <span className="drive-profile-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
              {session?.user?.name?.split(' ')[0] || 'Administrator'}
            </span>
            <div className="drive-profile-avatar">
              {userInitials.slice(0, 1)}
            </div>
            <span style={{ fontSize: '9px', color: '#94a3b8' }}><ChevronDown size="1em" className="inline-icon" aria-hidden="true" /></span>
          </button>

          {isProfileOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '260px',
                background: '#ffffff',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 16px 36px rgba(0, 0, 0, 0.12)',
                padding: '14px',
                zIndex: 200,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: '#3e64a0',
                    color: '#ffffff',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '15px',
                    fontWeight: 800,
                  }}
                >
                  {userInitials}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '13px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {session?.user?.name || 'Administrator'}
                  </strong>
                  <span style={{ display: 'block', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {session?.user?.email || 'Signed in'}
                  </span>
                  <span
                    style={{
                      display: 'inline-block',
                      marginTop: '4px',
                      padding: '2px 7px',
                      borderRadius: '6px',
                      background: '#eef3fa',
                      color: '#3e64a0',
                      fontSize: '10.5px',
                      fontWeight: 700,
                    }}
                  >
                    {rawRole.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div style={{ height: '1px', background: '#f1f5f9', margin: '10px 0' }}></div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <a
                  href="/settings"
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    color: '#334155',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span><Settings size="1em" className="inline-icon" aria-hidden="true" /></span> Account Settings
                </a>
                <a
                  href="/login"
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    color: '#3e64a0',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span><ArrowLeftRight size="1em" className="inline-icon" aria-hidden="true" /></span> Switch Role / Account
                </a>
                <button
                  type="button"
                  onClick={handleSignOut}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    color: '#dc2626',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#fef2f2')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span><LogOut size="1em" className="inline-icon" aria-hidden="true" /></span> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>

        <span className="drive-header-divider" aria-hidden="true" />
        {/* Sidebar Collapse Toggle */}
        <button
          type="button"
          className="drive-icon-button"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-label="Toggle Sidebar"
          onClick={toggleSidebar}
        >
          {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
};
