'use client';

import { ArrowRight, BellRing, Check, ChevronDown, CircleHelp, LockKeyhole, DoorOpen, MapPinned, ScanSearch, Shield, SlidersHorizontal, UserRoundCog } from 'lucide-react';
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

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
type InboxItem = { id: string; title: string; message: string; href: string; readAt?: string | null };
type Inbox = { unread: number; items: InboxItem[] };

type Tool = 'search' | 'notifications' | 'location' | 'profile';

export function WorkspaceTools({
  location, locationOptions, isLocationOpen, setIsLocationOpen, chooseLocation, session,
  userInitials, rawRole, isProfileOpen, setIsProfileOpen, handleSignOut, links,
}: WorkspaceToolsProps) {
  const [localPanel, setLocalPanel] = useState<'search' | 'notifications' | null>(null);
  const [confirmLock, setConfirmLock] = useState(false);
  const [lockNotice, setLockNotice] = useState<'setup' | 'error' | null>(null);
  const [inbox, setInbox] = useState<Inbox>();
  const [inboxError, setInboxError] = useState('');
  const [inboxRefresh, refreshInbox] = useState(0);
  const [marking, setMarking] = useState<string | null>(null);
  const token = session?.accessToken;
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

  useEffect(() => {
    setInbox(undefined);
    setInboxError('');
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(API + '/reports/notifications', {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('Could not load notifications.');
        const { data } = await response.json() as { data: Inbox };
        if (controller.signal.aborted) return;
        setInbox(data);
        setInboxError('');
      } catch {
        if (!controller.signal.aborted) setInboxError('Could not load notifications.');
      }
    };
    void load();
    const interval = window.setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    window.addEventListener('focus', load);
    window.addEventListener('pos:notification-read', load);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', load);
      window.removeEventListener('pos:notification-read', load);
    };
  }, [token, inboxRefresh]);

  async function markRead(item: InboxItem) {
    if (marking || !token || item.readAt) return;
    setMarking(item.id);
    try {
      const response = await fetch(`${API}/reports/notifications/${encodeURIComponent(item.id)}/read`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Could not mark the notification as read.');
      window.dispatchEvent(new Event('pos:notification-read'));
    } catch {
      setInboxError('Could not mark the notification as read.');
    } finally { setMarking(null); }
  }

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
    else {
      setLocalPanel(next);
      if (next === 'notifications') refreshInbox((revision) => revision + 1);
    }
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
          {locationLocked ? <Shield size={16} aria-hidden="true" /> : <MapPinned size={16} aria-hidden="true" />}
          <span>{location || 'Location unavailable'}</span>
          {!locationLocked && <ChevronDown size={13} aria-hidden="true" />}
        </button>
        {panel === 'location' && !locationLocked && (
          <div className="utility-popover">
            <strong>Choose location</strong>
            {locationOptions.map((option) => <button className="utility-option" type="button" key={option} onClick={() => { chooseLocation(option); closePanels(); }}>
              <MapPinned size={15} aria-hidden="true" /><span>{option}</span>{option === location && <Check size={15} aria-hidden="true" />}
            </button>)}
          </div>
        )}
      </div>
      <div className="utility-icon-group">
        <div className="utility-wrap">
          <button type="button" className="utility-button" data-tool="search" data-tip={supportsUserLookup ? 'Find pages or users' : 'Find workspace pages'} aria-label="Search" aria-expanded={panel === 'search'} onClick={() => toggle('search')}><ScanSearch size={19} aria-hidden="true" /></button>
          {panel === 'search' && <div className="utility-popover utility-search" role="search">
            <form onSubmit={submitSearch}>
              <ScanSearch size={16} aria-hidden="true" />
              <input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search workspace" placeholder={supportsUserLookup ? 'Find pages or users…' : 'Find pages…'} />
            </form>
            {matches.map((link) => <Link key={link.href} href={link.href} className="utility-option" onClick={closePanels}><span>{link.label}</span><ArrowRight size={14} aria-hidden="true" /></Link>)}
            {search && supportsUserLookup && <Link href={`/admin/users?q=${encodeURIComponent(query.trim())}`} className="utility-option" onClick={closePanels}><span>Find users for “{query.trim()}”</span><ArrowRight size={14} aria-hidden="true" /></Link>}
            {!matches.length && !supportsUserLookup && <p>No pages found.</p>}
          </div>}
        </div>
        {session && <div className="utility-wrap">
          <button type="button" className="utility-button utility-notifications" data-tool="notifications" data-tip="View notifications"
            aria-label={inbox?.unread ? `Notifications, ${inbox.unread} unread` : 'Notifications'}
            aria-expanded={panel === 'notifications'} onClick={() => toggle('notifications')}>
            <BellRing size={19} aria-hidden="true" />
            {Boolean(inbox?.unread) && <span className="utility-unread" aria-hidden="true">{(inbox?.unread ?? 0) > 99 ? '99+' : inbox?.unread}</span>}
          </button>
          {panel === 'notifications' && <div className="utility-popover utility-inbox" aria-label="Notifications">
            <strong>Notifications</strong>
            {inboxError && <div className="utility-inbox-error" role="status">{inboxError} <button type="button" onClick={() => refreshInbox((revision) => revision + 1)}>Retry</button></div>}
            {!inbox && !inboxError && <p role="status">Loading notifications…</p>}
            {inbox?.items.length === 0 && <p>No notifications.</p>}
            {!!inbox?.items.length && <ul>
              {inbox.items.map((item) => <li key={item.id}>
                <Link href={item.href} className="utility-option" onClick={closePanels}><span>{item.title}<small>{item.message}</small></span></Link>
                {!item.readAt && <button className="utility-read" type="button" disabled={!!marking} onClick={() => void markRead(item)} aria-label={`Mark ${item.title} as read`}>Mark read</button>}
              </li>)}
            </ul>}
            {canReadReports && <Link href="/reports?alerts=1" className="utility-option" onClick={closePanels}><span>Open operational alerts</span><ArrowRight size={14} aria-hidden="true" /></Link>}
          </div>}
        </div>}
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
          <Link href="/settings" className="utility-option" onClick={closePanels}><SlidersHorizontal size={16} aria-hidden="true" /><span>Account settings</span></Link>
          <a href="/operations" target="_blank" rel="noreferrer" className="utility-option"><CircleHelp size={16} aria-hidden="true" /><span>Help</span></a>
          <a href="/login" className="utility-option"><UserRoundCog size={16} aria-hidden="true" /><span>Switch account</span></a>
          <button type="button" className="utility-option utility-signout" onClick={handleSignOut}><DoorOpen size={16} aria-hidden="true" /><span>Sign out</span></button>
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
