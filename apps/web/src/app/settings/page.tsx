'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getStoredSession, AuthSession } from '@/lib/auth';
import {
  UserPreferences,
  DEFAULT_PREFERENCES,
  SETTINGS_STORAGE_PREFIX,
  SettingItem,
  getSettingGroups,
  SettingPanel,
  FORM_ITEMS,
  SettingsDrawer,
  Icon,
} from '@/components/settings';
import styles from '@/components/settings/settings.module.css';

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  STORE_MANAGER: 'Store manager',
  CENTRAL_MANAGER: 'Warehouse manager',
  WAREHOUSE_MANAGER: 'Warehouse manager',
  SUB_WAREHOUSE_MANAGER: 'Sub-warehouse manager',
  CASHIER: 'Cashier',
  STAFF: 'Staff',
};

export default function SettingsPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const current = getStoredSession();
    setSession(current);
    if (current?.user) {
      try {
        const saved = window.localStorage.getItem(`${SETTINGS_STORAGE_PREFIX}${current.user.role}`);
        if (saved) setPrefs({ ...DEFAULT_PREFERENCES, ...JSON.parse(saved) });
      } catch {
        // Ignore unreadable saved settings and keep the defaults
      }
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const role = session?.user?.role || 'STORE_MANAGER';
  const groups = useMemo(() => getSettingGroups(role), [role]);
  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const openItem: SettingItem | undefined = allItems.find((i) => i.id === openId);

  const save = (updated: UserPreferences, message = 'Saved') => {
    setPrefs(updated);
    if (session?.user?.role) {
      try {
        window.localStorage.setItem(`${SETTINGS_STORAGE_PREFIX}${session.user.role}`, JSON.stringify(updated));
      } catch {
        // Storage full or blocked; the change still applies for this visit
      }
    }
    setToast(message);
  };

  const updatePref = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => save({ ...prefs, [key]: value });

  const resetDefaults = () => {
    if (window.confirm('Put every setting on this page back to its default value?')) save(DEFAULT_PREFERENCES, 'Settings reset to defaults');
  };

  const close = useCallback(() => setOpenId(null), []);
  const formDone = (msg: string) => { setOpenId(null); setToast(msg); };

  const name = session?.user?.name || session?.user?.email?.split('@')[0] || 'Guest';
  const email = session?.user?.email || 'Not signed in';
  const initials = (session?.user?.name || session?.user?.email || 'PR').slice(0, 2).toUpperCase();

  return (
    <div className={`${styles.page} app-page`}>
      <header className={styles.header}>
        <div>
          <h1>Settings</h1>
          <p>Choose an option to change it. Your changes are saved straight away.</p>
        </div>
      </header>

      <div className={styles.layout}>
        {/* Who is signed in */}
        <aside className={styles.profile}>
          <div className={styles.profileTop}>
            <span className={styles.avatar}>{initials}</span>
            <h2>{name}</h2>
            <span className={styles.rolePill}><Icon name="user" size={13} /> {ROLE_LABEL[role] ?? role.replace(/_/g, ' ').toLowerCase()}</span>
          </div>
          <ul className={styles.metaList}>
            <li><i><Icon name="mail" size={16} /></i><div><small>Email</small><b title={email}>{email}</b></div></li>
            <li><i><Icon name="store" size={16} /></i><div><small>Assigned store</small><b>Use the location selector</b></div></li>
            <li><i><Icon name="lock" size={16} /></i><div><small>Screen lock</small><b>{prefs.autoLockMinutes ? `After ${prefs.autoLockMinutes} minutes` : 'Never'}</b></div></li>
          </ul>
          <div className={styles.savedNote}>
            <Icon name="check" size={16} />
            <span>Settings are saved on this device for your role.</span>
          </div>
          <button type="button" className={styles.ghostButton} onClick={resetDefaults}>
            <Icon name="reset" size={16} /> Reset to defaults
          </button>
        </aside>

        {/* Grouped options; each row opens a panel on the right */}
        <div className={styles.groups}>
          {groups.map((group) => (
            <section key={group.id} className={styles.group}>
              <div className={styles.groupHead}>
                <h2>{group.title}</h2>
                <p>{group.description}</p>
              </div>
              {group.items.map((item) => {
                const content = (
                  <>
                    <span className={styles.rowIcon}><Icon name={item.icon} /></span>
                    <span className={styles.rowText}>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                    </span>
                    <span className={styles.rowValue}>{item.summary(prefs)}</span>
                    <span className={styles.chev}><Icon name={item.href ? 'external' : 'chevron'} size={16} /></span>
                  </>
                );
                return item.href ? (
                  <Link key={item.id} href={item.href} className={styles.row}>{content}</Link>
                ) : (
                  <button key={item.id} type="button" className={styles.row} onClick={() => setOpenId(item.id)}>{content}</button>
                );
              })}
            </section>
          ))}
        </div>
      </div>

      {openItem && (
        <SettingsDrawer
          icon={openItem.icon}
          title={openItem.title}
          subtitle={openItem.description}
          onClose={close}
          footer={FORM_ITEMS[openItem.id] ? (
            <>
              <button type="button" className={styles.ghostButton} onClick={close}>Cancel</button>
              <button type="submit" form="settings-form" className={styles.primaryButton}>{FORM_ITEMS[openItem.id]}</button>
            </>
          ) : undefined}
        >
          <SettingPanel id={openItem.id} role={role} prefs={prefs} onUpdate={updatePref} onSaved={formDone} />
        </SettingsDrawer>
      )}

      {toast && (
        <div className={styles.toast} role="status">
          <Icon name="check" size={15} /> {toast}
        </div>
      )}
    </div>
  );
}
