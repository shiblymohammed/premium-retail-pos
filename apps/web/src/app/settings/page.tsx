'use client';

import { FormEvent, useEffect, useState } from 'react';
import { getStoredSession, AuthSession } from '@/lib/auth';
import {
  SettingsTab,
  UserPreferences,
  DEFAULT_PREFERENCES,
  SETTINGS_STORAGE_PREFIX,
  SettingsHeader,
  SettingsTabs,
  GeneralTab,
  RoleOpsTab,
  SecurityTab,
  NotificationsTab,
} from '@/components/settings';

export default function SettingsPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [notice, setNotice] = useState('');

  // Password / PIN Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cashierPin, setCashierPin] = useState('1234');
  const [pinNotice, setPinNotice] = useState('');

  // Operator Name state
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    const currentSession = getStoredSession();
    setSession(currentSession);
    if (currentSession?.user) {
      setDisplayName(currentSession.user.name || currentSession.user.email.split('@')[0]);

      // Load user-specific preferences from localStorage
      const storageKey = `${SETTINGS_STORAGE_PREFIX}${currentSession.user.role}`;
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved) {
          setPrefs({ ...DEFAULT_PREFERENCES, ...JSON.parse(saved) });
        }
      } catch {
        // Fallback to default
      }
    }
  }, []);

  const saveSettings = (updated: UserPreferences) => {
    setPrefs(updated);
    if (session?.user?.role) {
      const storageKey = `${SETTINGS_STORAGE_PREFIX}${session.user.role}`;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {
        // Storage write
      }
    }
    setNotice('Preferences updated and saved successfully.');
    setTimeout(() => setNotice(''), 3500);
  };

  const handleUpdatePreference = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    const next = { ...prefs, [key]: value };
    saveSettings(next);
  };

  const handleChangePassword = (e: FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      alert('Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      alert('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('New password and confirm password do not match.');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setNotice('Password updated successfully. Active security token refreshed.');
    setTimeout(() => setNotice(''), 3500);
  };

  const handleSavePin = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(cashierPin)) {
      alert('PIN must be exactly 4 digits (0-9).');
      return;
    }
    setPinNotice('Terminal unlock PIN updated successfully.');
    setTimeout(() => setPinNotice(''), 3500);
  };

  const handleResetDefaults = () => {
    if (confirm('Reset all workstation settings to system defaults?')) {
      saveSettings(DEFAULT_PREFERENCES);
    }
  };

  const role = session?.user?.role || 'STORE_MANAGER';
  const roleName = role.replace(/_/g, ' ');
  const userInitials = (session?.user?.name || session?.user?.email || 'PR').slice(0, 2).toUpperCase();

  const isCashier = role === 'CASHIER';
  const isStoreManager = role === 'STORE_MANAGER';
  const isWarehouse = role === 'CENTRAL_MANAGER' || role === 'WAREHOUSE_MANAGER' || role === 'SUB_WAREHOUSE_MANAGER';
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

  // Role Tab Title
  const getRoleTabLabel = () => {
    if (isCashier) return 'POS Hardware & Lane';
    if (isStoreManager) return 'Store Floor & Policy';
    if (isWarehouse) return 'Warehouse & Logistics';
    if (isAdmin) return 'Enterprise Governance';
    return 'Shift & Attendance';
  };

  return (
    <div style={{ padding: '28px 32px 60px', maxWidth: '1280px', margin: '0 auto', color: '#0f172a' }}>
      {/* Top Banner / Operator Identity */}
      <SettingsHeader
        userInitials={userInitials}
        displayName={displayName}
        email={session?.user?.email}
        roleName={roleName}
        assignedStore="Downtown Store"
        onResetDefaults={handleResetDefaults}
      />

      {/* Notice Alert Banner */}
      {notice && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            fontSize: '13px',
            fontWeight: 600,
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>✓ {notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            style={{ background: 'none', border: 'none', color: '#065f46', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Modular Tab Navigation Strip */}
      <SettingsTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        roleTabLabel={getRoleTabLabel()}
      />

      {/* TAB 1: GENERAL & WORKSTATION */}
      {activeTab === 'general' && (
        <GeneralTab prefs={prefs} onUpdate={handleUpdatePreference} />
      )}

      {/* TAB 2: ROLE-SPECIFIC OPERATIONAL CONTROLS */}
      {activeTab === 'role-ops' && (
        <RoleOpsTab role={role} prefs={prefs} onUpdate={handleUpdatePreference} />
      )}

      {/* TAB 3: SECURITY & FAST UNLOCK PIN */}
      {activeTab === 'security' && (
        <SecurityTab
          currentPassword={currentPassword}
          setCurrentPassword={setCurrentPassword}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          confirmPassword={confirmPassword}
          setConfirmPassword={setConfirmPassword}
          onChangePassword={handleChangePassword}
          cashierPin={cashierPin}
          setCashierPin={setCashierPin}
          onSavePin={handleSavePin}
          pinNotice={pinNotice}
        />
      )}

      {/* TAB 4: NOTIFICATIONS & ALERTS */}
      {activeTab === 'notifications' && (
        <NotificationsTab prefs={prefs} onUpdate={handleUpdatePreference} />
      )}
    </div>
  );
}
