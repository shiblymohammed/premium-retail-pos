'use client';

import { ArrowLeftRight, ArrowRight, Bell, Check, ChevronDown, CircleHelp, Lock, LockKeyhole, LogOut, MapPin, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Feedback } from '@/components/ui/feedback';
import { hasDevicePin, REQUEST_DEVICE_LOCK, setDeviceLocked } from '@/lib/device-lock';
import type { AuthSession } from '@/lib/auth';
import type { NavLink } from './nav-data';

type WorkspaceToolsProps = {
  location: string;
  locationOptions: string[];
  isLocationOpen: boolean;
  setIsLocationOpen: (open: boolean) => void;
  chooseLocation: (location: string) => void;
  session: AuthSession | null;
  userInitials: string;
  rawRole: string;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean) => void;
  handleSignOut: () => void;
  links: NavLink[];
};

type Tool = 'search' | 'notifications' | 'location' | 'profile';

export function WorkspaceTools({
  location, locationOptions, isLocationOpen, setIsLocationOpen, chooseLocation, session,
  userInitials, rawRole, isProfileOpen, setIsProfileOpen, handleSignOut, links,
}: WorkspaceToolsProps) {
  const [localPanel, setLocalPanel] = useState<'search' | 'notifications' | null>(null);
  const [confirmLock, setConfirmLock] = useState(false);
  const [lockNotice, setLockNotice] = useState<'setup' | 'error' | null>(null);
  const userId = session?.user.id;
  useEffect(() => {
    const request = () => {
      if (!userId) return;
      if (hasDevicePin(userId)) setConfirmLock(true);
      else setLockNotice('setup');
    };
    window.addEventListener(REQUEST_DEVICE_LOCK, request);
    return () => window.removeEventListener(REQUEST_DEVICE_LOCK, request);
  }, [userId]);
  const [query, setQuery] = useState('');
  const toolsRef = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const panel: Tool | null = isLocationOpen ? 'location' : isProfileOpen ? 'profile' : localPanel;
  const locationLocked = locationOptions.length <= 1;
  const supportsUserLookup = links.some((link) => link.href === '/admin/users');
  const canReadReports = links.some((link) => link.href === '/reports');
  const search = query.trim().toLowerCase();
  const matches = links.filter((link) => link.label.toLowerCase().includes(search)).slice(0, 6);

  function closePanels() {
    setIsLocationOpen(false);
    setIsProfileOpen(false);
    setLocalPanel(null);
  }

  function toggle(next: Tool) {
    const wasOpen = panel === next;
    closePanels();
    if (wasOpen) return;
    if (next === 'location') setIsLocationOpen(true);
    else if (next === 'profile') setIsProfileOpen(true);
    else setLocalPanel(next);
  }

  useEffect(() => {
    if (panel === 'search') searchInput.current?.focus();
    if (!panel) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !toolsRef.current?.contains(event.target)) setLocalPanel(null);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [panel]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!search) return;
    if (matches.length) {
      window.location.href = matches[0].href;
    } else if (supportsUserLookup) {
      window.location.href = `/admin/users?q=${encodeURIComponent(query.trim())}`;
    }
  }

  return (
    <div ref={toolsRef} className="workspace-utilities" aria-label="Workspace tools" onKeyDown={(event) => {
      if (event.key !== 'Escape' || !panel) return;
      closePanels();
      toolsRef.current?.querySelector<HTMLButtonElement>(`[data-tool="${panel}"]`)?.focus();
    }}>
      <div className="drive-location-wrap utility-wrap">
        <button type="button" className="utility-location" data-tool="location" aria-label={`Store: ${location || 'Location unavailable'}`} aria-expanded={!locationLocked ? panel === 'location' : undefined} aria-disabled={locationLocked} data-tip={locationLocked ? 'Current location scope' : 'Choose a store or location'} onClick={() => { if (!locationLocked) toggle('location'); }}>
          {locationLocked ? <Lock size={16} aria-hidden="true" /> : <MapPin size={16} aria-hidden="true" />}
          <span>{location || 'Location unavailable'}</span>
          {!locationLocked && <ChevronDown size={13} aria-hidden="true" />}
        </button>
        {panel === 'location' && !locationLocked && (
          <div className="utility-popover">
            <strong>Choose location</strong>
            {locationOptions.map((option) => <button className="utility-option" type="button" key={option} onClick={() => { chooseLocation(option); closePanels(); }}>
              <MapPin size={15} aria-hidden="true" /><span>{option}</span>{option === location && <Check size={15} aria-hidden="true" />}
            </button>)}
          </div>
        )}
      </div>
      <div className="utility-icon-group">
        <div className="utility-wrap">
          <button type="button" className="utility-button" data-tool="search" data-tip={supportsUserLookup ? 'Find pages or users' : 'Find workspace pages'} aria-label="Search" aria-expanded={panel === 'search'} onClick={() => toggle('search')}><Search size={19} aria-hidden="true" /></button>
          {panel === 'search' && <div className="utility-popover utility-search" role="search">
            <form onSubmit={submitSearch}>
              <Search size={16} aria-hidden="true" />
              <input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search workspace" placeholder={supportsUserLookup ? 'Find pages or users…' : 'Find pages…'} />
            </form>
            {matches.map((link) => <Link key={link.href} href={link.href} className="utility-option" onClick={closePanels}><span>{link.label}</span><ArrowRight size={14} aria-hidden="true" /></Link>)}
            {search && supportsUserLookup && <Link href={`/admin/users?q=${encodeURIComponent(query.trim())}`} className="utility-option" onClick={closePanels}><span>Find users for “{query.trim()}”</span><ArrowRight size={14} aria-hidden="true" /></Link>}
            {!matches.length && !supportsUserLookup && <p>No pages found.</p>}
          </div>}
        </div>
        <div className="utility-wrap">
          <button type="button" className="utility-button" data-tool="notifications" data-tip="View operational alerts" aria-label="Notifications" aria-expanded={panel === 'notifications'} onClick={() => toggle('notifications')}><Bell size={19} aria-hidden="true" /></button>
          {panel === 'notifications' && <div className="utility-popover">
            <strong>Notifications</strong>
            {canReadReports ? <>
              <p>Review stock, transfer and audit alerts.</p>
              <a href="/reports?alerts=1" className="utility-option"><span>Open operational alerts</span><ArrowRight size={14} aria-hidden="true" /></a>
            </> : <p>Operational alerts require access to Reports.</p>}
          </div>}
        </div>
        {userId && <button type="button" className="utility-button" data-tip="Lock this screen" aria-label="Lock screen" onClick={() => {
          closePanels();
          setLockNotice(null);
          window.dispatchEvent(new Event(REQUEST_DEVICE_LOCK));
        }}><LockKeyhole size={18} aria-hidden="true" /></button>}
      </div>
      {session && <div className="drive-profile-wrap utility-wrap">
        <button type="button" className="utility-profile" data-tool="profile" data-tip="Manage your account" aria-label="Account" aria-expanded={panel === 'profile'} onClick={() => toggle('profile')}>
          <span className="utility-avatar">{userInitials.slice(0, 1)}</span>
          <span className="utility-profile-name">{session.user.name?.split(' ')[0] || 'Account'}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {panel === 'profile' && <div className="utility-popover">
          <div className="utility-identity"><strong>{session.user.name || 'Account'}</strong><span>{session.user.email}</span><small>{rawRole.replaceAll('_', ' ')}</small></div>
          <Link href="/settings" className="utility-option" onClick={closePanels}><Settings size={16} aria-hidden="true" /><span>Account settings</span></Link>
          <a href="/operations" target="_blank" rel="noreferrer" className="utility-option"><CircleHelp size={16} aria-hidden="true" /><span>Help</span></a>
          <a href="/login" className="utility-option"><ArrowLeftRight size={16} aria-hidden="true" /><span>Switch account</span></a>
          <button type="button" className="utility-option utility-signout" onClick={handleSignOut}><LogOut size={16} aria-hidden="true" /><span>Sign out</span></button>
        </div>}
      </div>}
      {lockNotice && <Feedback toast tone={lockNotice === 'error' ? 'error' : 'info'} onDismiss={() => setLockNotice(null)}
        action={lockNotice === 'setup' ? <a className="ui-feedback-action" href="/settings?panel=pin">Create PIN</a> : undefined}>
        {lockNotice === 'setup' ? 'Create a device PIN to lock this screen.' : 'Could not lock this screen on this device.'}
      </Feedback>}
      {confirmLock && <ConfirmAction title="Lock this screen?" confirmLabel="Yes, lock" cancelLabel="No, keep working"
        onCancel={() => setConfirmLock(false)} onConfirm={() => {
          setConfirmLock(false);
          if (!userId) return;
          try { setDeviceLocked(userId, true); } catch { setLockNotice('error'); }
        }}>You’ll need your device PIN to continue.</ConfirmAction>}
    </div>
  );
}
