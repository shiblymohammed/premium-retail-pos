'use client';

import { LockKeyhole } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DEFAULT_PREFERENCES, SETTINGS_STORAGE_PREFIX } from '@/components/settings/types';
import { Feedback } from '@/components/ui/feedback';
import { DEVICE_LOCK_CHANGED, hasDevicePin, isDeviceLocked, matchesDevicePin, setDeviceLocked } from '@/lib/device-lock';

export function DeviceLock({ userId, role, onSignOut }: { userId: string; role: string; onSignOut: () => Promise<void> }) {
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let timer: number;
    const schedule = () => {
      window.clearTimeout(timer);
      const isLocked = isDeviceLocked(userId);
      setLocked(isLocked);
      if (isLocked || !hasDevicePin(userId)) return;
      try {
        const saved = window.localStorage.getItem(SETTINGS_STORAGE_PREFIX + role);
        const minutes = saved ? JSON.parse(saved).autoLockMinutes : DEFAULT_PREFERENCES.autoLockMinutes;
        if (typeof minutes === 'number' && minutes > 0) {
          timer = window.setTimeout(() => {
            try { setDeviceLocked(userId, true); } catch { /* Storage may be blocked. */ }
          }, minutes * 60_000);
        }
      } catch { /* Ignore unreadable preferences. */ }
    };
    const activity = ['pointerdown', 'keydown', 'wheel', 'storage', DEVICE_LOCK_CHANGED];
    schedule();
    for (const event of activity) window.addEventListener(event, schedule, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const event of activity) window.removeEventListener(event, schedule);
    };
  }, [userId, role]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (locked && !element.open) element.showModal();
    if (!locked && element.open) element.close();
  }, [locked]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (checking || !/^\d{4}$/.test(pin)) return;
    setChecking(true);
    setError('');
    try {
      if (!(await matchesDevicePin(userId, pin))) {
        setError('Incorrect PIN. Try again or sign in with your password.');
        return;
      }
      setDeviceLocked(userId, false);
    } catch {
      setError('Could not unlock this screen. Sign in with your password.');
    } finally {
      setPin('');
      setChecking(false);
    }
  }

  return <dialog ref={dialog} className="device-lock" aria-labelledby="device-lock-title" onCancel={(event) => event.preventDefault()} onKeyDown={(event) => event.stopPropagation()}>
    <LockKeyhole size={26} aria-hidden="true" />
    <h2 id="device-lock-title">Screen locked</h2>
    <p>Enter your device PIN to continue.</p>
    <form onSubmit={unlock}>
      <label>4-digit PIN <input type="password" name="device-unlock-pin" autoComplete="off" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} maxLength={4} /></label>
      <div className="device-lock-keypad" aria-label="Numeric keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Delete'].map((key) =>
          <button key={key} type="button" className="admin-secondary" disabled={checking} onClick={() => {
            setError('');
            setPin((value) => key === 'Clear' ? '' : key === 'Delete' ? value.slice(0, -1) : (value + key).slice(0, 4));
          }}>{key}</button>)}
      </div>
      {error && <Feedback tone="error">{error}</Feedback>}
      <div className="device-lock-actions">
        <button type="button" className="admin-secondary" onClick={async () => {
          await onSignOut();
          try { setDeviceLocked(userId, false); } catch { /* The signed-out account no longer has access. */ }
        }}>Sign out</button>
        <button type="submit" className="admin-primary" disabled={pin.length !== 4 || checking}>{checking ? 'Checking…' : 'Unlock'}</button>
      </div>
    </form>
  </dialog>;
}
