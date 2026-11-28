'use client';

import { ConfirmAction } from '@/components/ui/confirm-action';
import { Feedback } from '@/components/ui/feedback';
import {
  Ban,
  Check,
  Clipboard,
  ClipboardCheck,
  CreditCard,
  KeyRound,
  Store,
  TriangleAlert,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import { AdminModal } from '@/components/admin';
import { AdminActionMenu } from '@/components/admin/admin-action-menu';
import { PermissionAudit, directPermissionLabels } from './permission-audit';
import { permissionCategories } from '@/components/ui/permission-matrix';
import { PermissionEditor } from './permission-editor';
import styles from './permissions.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export interface LocationRecord {
  id: string;
  name: string;
  type: string;
}

export interface UserRecord {
  id: string;
  name?: string;
  email: string;
  employeeCode?: string;
  role: string;
  isActive: boolean;
  canCancelSales: boolean;
  canProcessReturns: boolean;
  canCountStockAudits: boolean;
  permissionOverrides?: Record<string, boolean> | null;
  locationScopes?: Array<{ locationId: string; location?: { name: string } }>;
}

type PermissionProfile = {
  definitions: Record<string, string>;
  permissionOverrides: Record<string, boolean> | null;
};

const roleLabels: Record<string, string> = {
  ALL: 'All Roles',
  STORE_MANAGER: 'Store Manager',
  CASHIER: 'Cashier Station',
  STAFF: 'Floor Staff',
  CENTRAL_MANAGER: 'Central Warehouse',
  SUB_WAREHOUSE_MANAGER: 'Sub Warehouse',
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin Director',
};

function isDirectPermission(key: string): key is keyof typeof directPermissionLabels {
  return Object.prototype.hasOwnProperty.call(directPermissionLabels, key);
}

async function errorMessage(response: Response) {
  try {
    const result = await response.json();
    return typeof result.message === 'string' ? result.message : 'Request failed';
  } catch {
    return `Request failed (${response.status})`;
  }
}

export default function SalesPermissionsAdmin() {
  const [token, setToken] = useState('');
  const [definitions, setDefinitions] = useState<Record<string, string>>({});

  // Data
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [permissionFilter, setPermissionFilter] = useState('');
  const [permissionState, setPermissionState] = useState('on');

  // Selected row for highlight
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Status & Feedback
  const [savingUserId, setSavingUserId] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Modals
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Edit Permissions Modal
  const [confirmSave, setConfirmSave] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [modalCanCancel, setModalCanCancel] = useState(false);
  const [modalCanReturn, setModalCanReturn] = useState(false);
  const [modalCanAudit, setModalCanAudit] = useState(false);
  const [modalReason, setModalReason] = useState('');
  const [permissionProfile, setPermissionProfile] = useState<PermissionProfile | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [profileError, setProfileError] = useState('');
  const [profileReload, setProfileReload] = useState(0);

  const [revokeOverrides, setRevokeOverrides] = useState(false);

  const openEditModal = useCallback((user: UserRecord, revoke = false) => {
    setRevokeOverrides(revoke);
    setError('');
    setEditingUser(user);
    setModalCanCancel(!revoke && user.canCancelSales);
    setModalCanReturn(!revoke && user.canProcessReturns);
    setModalCanAudit(!revoke && user.canCountStockAudits);
    setModalReason('');
    setPermissionProfile(null);
    setOverrides({});
    setProfileError('');
    setSelectedUserId(user.id);
  }, []);

  // Initialize from Session or API
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    const requestedUser = params.get('user');
    if (query) setSearch(query);
    const session = getStoredSession();
    if (!session?.accessToken) {
      setError('Sign in with an administrator account to load live permissions.');
      setLoading(false);
      return;
    }
    setToken(session.accessToken);
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    Promise.all([
        fetch(`${API_BASE}/users/permission-definitions`, { headers, cache: 'no-store' }),
        fetch(`${API_BASE}/users?isActive=true`, { headers, cache: 'no-store' }),
        fetch(`${API_BASE}/locations?isActive=true`, { headers, cache: 'no-store' }),
      ])
        .then(async ([definitionsRes, usersRes, locsRes]) => {
          const failed = [definitionsRes, usersRes, locsRes].find((response) => !response.ok);
          if (failed) throw new Error(await errorMessage(failed));
          const [definitionsData, usersData, locsData] = await Promise.all([
            definitionsRes.json(),
            usersRes.json(),
            locsRes.json(),
          ]);
          if (definitionsData?.data) setDefinitions(definitionsData.data);
          if (Array.isArray(usersData?.data)) {
            const eligible = usersData.data.filter(
              (u: UserRecord) => u.id !== session.user?.id && u.role !== 'SUPER_ADMIN',
            ) as UserRecord[];
            setUsers(eligible);
            const requested = eligible.find((user) => user.id === requestedUser);
            if (requested) openEditModal(requested);
          }
          if (Array.isArray(locsData?.data)) setLocations(locsData.data);
        })
        .catch((loadError: unknown) => {
          setError(loadError instanceof Error ? loadError.message : 'Could not load permissions from the server.');
        })
        .finally(() => setLoading(false));
  }, [openEditModal]);

  const editingUserId = editingUser?.id;
  useEffect(() => {
    if (!editingUserId || !token) return;
    const controller = new AbortController();
    setProfileError('');
    void fetch(`${API_BASE}/users/${editingUserId}/permissions`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error(await errorMessage(response));
      const { data } = await response.json() as { data: PermissionProfile };
      if (!controller.signal.aborted) {
        setPermissionProfile(data);
        setOverrides(revokeOverrides ? {} : data.permissionOverrides ?? {});
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setProfileError(cause instanceof Error ? cause.message : 'Could not load individual permissions.');
    });
    return () => controller.abort();
  }, [editingUserId, profileReload, revokeOverrides, token]);

  const locationMap = useMemo(() => {
    const map = new Map<string, string>();
    locations.forEach((loc) => map.set(loc.id, loc.name));
    return map;
  }, [locations]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const name = user.name || user.email.split('@')[0];
      const code = user.employeeCode || '';
      const searchMatch =
        !search.trim() ||
        name.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase()) ||
        code.toLowerCase().includes(search.toLowerCase());

      const roleMatch = roleFilter === 'ALL' || user.role === roleFilter;

      const scopes = user.locationScopes || [];
      const locationMatch =
        locationFilter === 'ALL' ||
        scopes.some((s) => s.locationId === locationFilter || locationMap.get(s.locationId) === locationFilter);

      const permission = isDirectPermission(permissionFilter) ? user[permissionFilter] : user.permissionOverrides?.[permissionFilter];
      const state = permission === undefined ? 'default' : permission ? 'on' : 'off';
      return searchMatch && roleMatch && locationMatch && (!permissionFilter || permissionState === state);
    });
  }, [users, search, roleFilter, locationFilter, permissionFilter, permissionState, locationMap]);

  const resetAllFilters = () => {
    setSearch('');
    setRoleFilter('ALL');
    setLocationFilter('ALL');
    setPermissionFilter('');
    setPermissionState('on');
  };

  const salesChanged = !!editingUser && (modalCanCancel !== editingUser.canCancelSales || modalCanReturn !== editingUser.canProcessReturns);
  const stockChanged = !!editingUser && modalCanAudit !== editingUser.canCountStockAudits;
  const changedOverrides = Object.keys(permissionProfile?.definitions ?? {}).filter((key) => overrides[key] !== permissionProfile?.permissionOverrides?.[key]);
  const hasChanges = salesChanged || stockChanged || changedOverrides.length > 0;

  const handleSaveModal = async () => {
    setConfirmSave(false);
    if (!editingUser || !permissionProfile || !hasChanges || savingUserId) return;
    const reason = modalReason.trim();
    if ((salesChanged || stockChanged) && !reason) return;

    setSavingUserId(editingUser.id);
    setError('');
    const saved: string[] = [];
    const updateDirectory = (patch: Partial<UserRecord>) => {
      const changes = patch;
      setUsers((previous) => previous.map((user) => user.id === editingUser.id ? { ...user, ...changes } : user));
      setEditingUser((user) => user?.id === editingUser.id ? { ...user, ...changes } : user);
    };
    const patchPermissions = async (path: string, data: object) => {
      const response = await fetch(`${API_BASE}/users/${editingUser.id}/${path}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
    };

    try {
      if (!token) throw new Error('No authenticated session. Sign in again and retry.');
      if (salesChanged) {
        const changes = { canCancelSales: modalCanCancel, canProcessReturns: modalCanReturn };
        await patchPermissions('sales-permissions', { ...changes, reason });
        updateDirectory(changes);
        saved.push('sales permissions');
      }
      if (stockChanged) {
        const changes = { canCountStockAudits: modalCanAudit };
        await patchPermissions('stock-audit-permission', { ...changes, reason });
        updateDirectory(changes);
        saved.push('stock count permission');
      }
      if (changedOverrides.length) {
        await patchPermissions('permissions', overrides);
        setUsers((previous) => previous.map((user) => user.id === editingUser.id ? { ...user, permissionOverrides: overrides } : user));
      }

      setEditingUser(null);
      setNotice(`Updated permissions for ${editingUser.name || editingUser.email}.`);
    } catch (saveError: unknown) {
      const detail = saveError instanceof Error ? saveError.message : 'Request failed.';
      setError(saved.length
        ? `Saved: ${saved.join(', ')}. The remaining changes could not be confirmed. ${detail}`
        : `Could not confirm the permission changes. ${detail}`);
    } finally {
      setSavingUserId('');
    }
  };

  // Quick Preset Actions from Menu
  return (
    <div className="app-page admin-workspace">
      {/* Alert Notice (Matching users, company, discount-limits) */}
      {notice && <Feedback tone="info" onDismiss={() => setNotice('')}>{notice}</Feedback>}

      {error && !editingUser && <Feedback tone="error" onDismiss={() => setError('')}>{error}</Feedback>}
      {loading && (
        <div role="status" style={{ padding: '12px 16px', marginBottom: '16px', borderRadius: '9px', background: 'light-dark(#eff6ff, #1d2733)', border: '1px solid light-dark(#bfdbfe, #2e425b)', color: 'var(--retail-accent-strong)', fontSize: '13px' }}>
          Loading current permissions from the server…
        </div>
      )}

      <header className={styles.directoryHeader}>
        <h1>Sales Permissions &amp; Overrides</h1>
        <button type="button" className="admin-secondary" onClick={() => setIsAuditModalOpen(true)}>
          <ClipboardCheck size={16} aria-hidden="true" /> Permission audit log
        </button>
      </header>

      <div>
        <div className={styles.directoryToolbar}>
          <h2>Staff permissions <span>({filteredUsers.length})</span></h2>
          <div className={styles.directoryFilters}>
            <input type="search" aria-label="Find staff" placeholder="Find staff by name or email" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select aria-label="Filter by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="ALL">All roles</option>
              {[...new Set(users.map((user) => user.role))].sort().map((role) => (
                <option key={role} value={role}>{roleLabels[role] ?? role.replaceAll('_', ' ')}</option>
              ))}
            </select>
            <select aria-label="Filter by location" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
              <option value="ALL">All locations</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
            <select aria-label="Filter by permission" value={permissionFilter} onChange={(event) => {
              setPermissionFilter(event.target.value);
              setPermissionState('on');
            }}>
              <option value="">All permissions</option>
              <optgroup label="Sales and stock count access">
                {Object.entries(directPermissionLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
              </optgroup>
              {Object.entries(permissionCategories).map(([prefix, title]) => {
                const entries = Object.entries(definitions).filter(([key]) => key.startsWith(prefix + '.'));
                return entries.length > 0 && <optgroup key={prefix} label={title}>
                  {entries.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </optgroup>;
              })}
            </select>
            {permissionFilter && <select aria-label="Permission state" value={permissionState} onChange={(event) => setPermissionState(event.target.value)}>
              <option value="on">On</option>
              <option value="off">Off</option>
              {!isDirectPermission(permissionFilter) && <option value="default">Role default</option>}
            </select>}
            {(search || roleFilter !== 'ALL' || locationFilter !== 'ALL' || permissionFilter) && (
              <button type="button" className="admin-secondary" onClick={resetAllFilters}>Reset filters</button>
            )}
          </div>
        </div>

          {/* Structured File Table matching /admin/users & /admin/company */}
          <div
            style={{
              background: 'var(--retail-card)',
              border: '1px solid var(--retail-edge)',
              borderRadius: '14px',
              overflow: 'hidden',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            }}
          >
            <div className="admin-table-scroll permission-directory" role="region" aria-label="Staff permissions" tabIndex={0}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--retail-edge)',
                      background: 'var(--retail-card)',
                      color: 'var(--retail-muted)',
                      fontSize: '11px',
                      fontWeight: 750,
                      letterSpacing: '0.06em',
                    }}
                  >
                    <th style={{ padding: '14px 20px', width: '28%' }}>STAFF ACCOUNT</th>
                    <th style={{ padding: '14px 16px', width: '16%' }}>ORGANIZATIONAL ROLE</th>
                    <th style={{ padding: '14px 16px', width: '18%' }}>STORE LOCATION</th>
                    <th style={{ padding: '14px 14px', width: '13%' }}>SALES VOIDS</th>
                    <th style={{ padding: '14px 14px', width: '13%' }}>CUSTOMER RETURNS</th>
                    <th style={{ padding: '14px 14px', width: '12%' }}>STOCK AUDITS</th>
                    <th style={{ padding: '14px 20px', width: '8%', textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--retail-muted)' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}><KeyRound size="1em" className="inline-icon" aria-hidden="true" /></div>
                        <strong>No staff accounts match your active filter</strong>
                        <p style={{ margin: '4px 0 0', fontSize: '12px' }}>Try changing or clearing the filters.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const scopes = (user.locationScopes || [])
                        .map((s) => locationMap.get(s.locationId) || s.locationId)
                        .filter(Boolean);
                      const isSelected = selectedUserId === user.id;
                      const initials = (user.name || user.email)
                        .split(' ')
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase();

                      return (
                        <tr
                          key={user.id}
                          onClick={() => setSelectedUserId(user.id)}
                          style={{
                            borderBottom: '1px solid var(--retail-edge)',
                            background: isSelected ? 'var(--retail-raised)' : 'var(--retail-card)',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'var(--retail-raised)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'var(--retail-card)';
                          }}
                        >
                          {/* Col 1: Staff Account */}
                          <td data-column="Staff account" style={{ padding: '13px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  background: user.role === 'STORE_MANAGER' ? 'light-dark(#ecfdf5, #1d352c)' : user.role === 'CASHIER' ? 'var(--retail-accent-soft)' : 'var(--retail-edge)',
                                  color: user.role === 'STORE_MANAGER' ? 'light-dark(#047857, #8be0ad)' : user.role === 'CASHIER' ? 'var(--retail-accent)' : 'var(--retail-muted)',
                                  display: 'grid',
                                  placeItems: 'center',
                                  fontWeight: 800,
                                  fontSize: '12px',
                                  flexShrink: 0,
                                  border: '1px solid rgba(0,0,0,0.06)',
                                }}
                              >
                                {initials}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 750, color: 'var(--retail-ink)' }}>
                                    {user.name || user.email.split('@')[0]}
                                  </span>
                                  <span
                                    style={{
                                      width: '7px',
                                      height: '7px',
                                      borderRadius: '50%',
                                      background: user.isActive ? '#10b981' : '#94a3b8',
                                      display: 'inline-block',
                                    }}
                                    title={user.isActive ? 'Active Staff' : 'Inactive'}
                                  />
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--retail-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
                                  <span>{user.email}</span>
                                  <span>·</span>
                                  <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{user.employeeCode || user.id.slice(0, 8)}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Col 2: Role */}
                          <td data-column="Role" style={{ padding: '13px 16px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '4px 9px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                background:
                                  user.role === 'STORE_MANAGER'
                                    ? 'light-dark(#ecfdf5, #1d352c)'
                                    : user.role === 'CASHIER'
                                    ? 'var(--retail-accent-soft)'
                                    : user.role.includes('WAREHOUSE')
                                    ? 'light-dark(#eef2ff, #272541)'
                                    : 'var(--retail-edge)',
                                color:
                                  user.role === 'STORE_MANAGER'
                                    ? 'light-dark(#047857, #8be0ad)'
                                    : user.role === 'CASHIER'
                                    ? 'var(--retail-accent)'
                                    : user.role.includes('WAREHOUSE')
                                    ? 'light-dark(#4f46e5, #bdb6ff)'
                                    : 'var(--retail-muted)',
                                border: `1px solid ${
                                  user.role === 'STORE_MANAGER'
                                    ? '#a7f3d0'
                                    : user.role === 'CASHIER'
                                    ? '#bfdbfe'
                                    : user.role.includes('WAREHOUSE')
                                    ? '#c7d2fe'
                                    : 'var(--retail-edge-strong)'
                                }`,
                              }}
                            >
                              <span>{user.role === 'STORE_MANAGER' ? <UsersRound size="1em" className="inline-icon" aria-hidden="true" /> : user.role === 'CASHIER' ? <CreditCard size="1em" className="inline-icon" aria-hidden="true" /> : <UserRound size="1em" className="inline-icon" aria-hidden="true" />}</span>
                              <span>{roleLabels[user.role] || user.role}</span>
                            </span>
                          </td>

                          {/* Col 3: Assigned Store */}
                          <td data-column="Location" style={{ padding: '13px 16px' }}>
                            <div style={{ fontSize: '12.5px', color: 'var(--retail-ink)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                              <span style={{ color: 'var(--retail-accent)', fontSize: '13px' }}><Store size="1em" className="inline-icon" aria-hidden="true" /></span>
                              <span>{scopes.length ? scopes[0] : 'All Branches'}</span>
                              {scopes.length > 1 && (
                                <span style={{ fontSize: '10.5px', padding: '1px 5px', borderRadius: '4px', background: 'var(--retail-edge-strong)', color: 'var(--retail-muted)', fontWeight: 750 }}>
                                  +{scopes.length - 1}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Col 4: Sales Voids (Clean Pill) */}
                          <td data-column="Voids" style={{ padding: '13px 14px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 750,
                                background: user.canCancelSales ? 'light-dark(#ecfdf5, #1d352c)' : 'var(--retail-raised)',
                                color: user.canCancelSales ? 'light-dark(#047857, #8be0ad)' : '#94a3b8',
                                border: `1px solid ${user.canCancelSales ? '#a7f3d0' : 'var(--retail-edge-strong)'}`,
                              }}
                            >
                              <span>{user.canCancelSales ? <><Check size="1em" className="inline-icon" aria-hidden="true" /> Authorized</> : <><X size="1em" className="inline-icon" aria-hidden="true" /> Blocked</>}</span>
                            </span>
                          </td>

                          {/* Col 5: Customer Returns (Clean Pill) */}
                          <td data-column="Returns" style={{ padding: '13px 14px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 750,
                                background: user.canProcessReturns ? 'light-dark(#ecfdf5, #1d352c)' : 'var(--retail-raised)',
                                color: user.canProcessReturns ? 'light-dark(#047857, #8be0ad)' : '#94a3b8',
                                border: `1px solid ${user.canProcessReturns ? '#a7f3d0' : 'var(--retail-edge-strong)'}`,
                              }}
                            >
                              <span>{user.canProcessReturns ? <><Check size="1em" className="inline-icon" aria-hidden="true" /> Authorized</> : <><X size="1em" className="inline-icon" aria-hidden="true" /> Blocked</>}</span>
                            </span>
                          </td>

                          {/* Col 6: Stock Audits (Clean Pill) */}
                          <td data-column="Stock counts" style={{ padding: '13px 14px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 750,
                                background: user.canCountStockAudits ? 'var(--retail-accent-soft)' : 'var(--retail-raised)',
                                color: user.canCountStockAudits ? 'var(--retail-accent)' : '#94a3b8',
                                border: `1px solid ${user.canCountStockAudits ? '#bfdbfe' : 'var(--retail-edge-strong)'}`,
                              }}
                            >
                              <span>{user.canCountStockAudits ? <><Check size="1em" className="inline-icon" aria-hidden="true" /> Counter</> : <><X size="1em" className="inline-icon" aria-hidden="true" /> None</>}</span>
                            </span>
                          </td>

                          {/* Col 7: Actions */}
                          <td data-column="Actions" style={{ padding: '13px 20px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="admin-secondary"
                                onClick={() => openEditModal(user)}
                                aria-label={`Change permissions for ${user.name || user.email}`}
                              >
                                Change permissions
                              </button>

                              <AdminActionMenu label={`Permission actions for ${user.name || user.email}`}>
                                <button type="button" className="admin-action-danger" onClick={() => openEditModal(user, true)}><Ban size={15} aria-hidden="true" /> Revoke all overrides</button>
                                <button type="button" onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(user.email);
                                    setNotice(`Copied ${user.email} to clipboard.`);
                                  } catch {
                                    setError('Could not copy the email address.');
                                  }
                                }}><Clipboard size={15} aria-hidden="true" /> Copy email address</button>
                              </AdminActionMenu>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '13px 20px',
                background: 'var(--retail-card)',
                borderTop: '1px solid var(--retail-edge)',
                fontSize: '12px',
                color: 'var(--retail-muted)',
              }}
            >
              <span>
                Showing <strong>{filteredUsers.length}</strong> of <strong>{users.length}</strong> active accounts available for permission review
              </span>
              <span>
                Users includes inactive accounts and Super Admins, whose access is built in.
              </span>
            </div>
          </div>
      </div>

      {editingUser && <AdminModal
        isOpen
        title={revokeOverrides ? 'Review override revocation' : 'Change permissions'}
        maxWidth="720px"
        subtitle={`${editingUser.name || editingUser.email} · ${roleLabels[editingUser.role] || editingUser.role}`}
        badgeIcon={<KeyRound size={20} aria-hidden="true" />}
        onClose={() => { if (!savingUserId && !confirmSave) setEditingUser(null); }}
        footer={<>
          <button type="button" className="admin-secondary" disabled={!!savingUserId} onClick={() => setEditingUser(null)}>Cancel</button>
          <button type="submit" form="sales-permission-form" className="admin-primary" disabled={!!savingUserId || !permissionProfile || !hasChanges}>
            {savingUserId ? 'Saving…' : 'Save permissions'}
          </button>
        </>}
      >
        <form id="sales-permission-form" className={styles.form} onSubmit={(event) => {
          event.preventDefault();
          if (savingUserId || !permissionProfile || !hasChanges) return;
          if ((salesChanged || stockChanged) && !modalReason.trim()) {
            setError('Enter a reason for changing sales or stock count access.');
            return;
          }
          setConfirmSave(true);
        }}>
          {error && <Feedback tone="error">{error}</Feedback>}
          {revokeOverrides && <Feedback tone="info">Review the changes before saving. Sales and stock count switches are set to Off, and other permissions return to their role defaults.</Feedback>}
          {(salesChanged || stockChanged) && <label className={styles.reason}>
            <strong>Reason for changing access</strong>
            <textarea rows={3} value={modalReason} required disabled={!!savingUserId}
              onChange={(event) => setModalReason(event.target.value)} />
          </label>}
          <section aria-labelledby="per-person-permissions">
            <h4 id="per-person-permissions" className={styles.sectionTitle}>Per-person permissions</h4>
            <p className={styles.sectionHint}>Set an action to On or Off for this person, or use their role default. Assigned locations still limit access.</p>
            {profileError ? <Feedback tone="error" action={
              <button type="button" className="admin-secondary" onClick={() => setProfileReload((attempt) => attempt + 1)}>Retry</button>
            }>{profileError}</Feedback> : permissionProfile ? (
              <PermissionEditor definitions={permissionProfile.definitions} overrides={overrides} setOverrides={setOverrides}
                role={editingUser.role} disabled={!!savingUserId}
                switches={[
                  { key: 'sales.cancel', label: 'Cancel finalized bills', enabled: modalCanCancel, onChange: setModalCanCancel },
                  { key: 'sales.return', label: 'Process customer returns', enabled: modalCanReturn, onChange: setModalCanReturn },
                  { key: 'stock.count', label: 'Enter stock counts', enabled: modalCanAudit, onChange: setModalCanAudit },
                ]} />
            ) : <p role="status">Loading per-person permissions…</p>}
          </section>
        </form>
      </AdminModal>}

      {isAuditModalOpen && <PermissionAudit token={token} definitions={definitions} onClose={() => setIsAuditModalOpen(false)} />}

      {confirmSave && editingUser && <ConfirmAction title="Save access changes?" confirmLabel="Yes, save changes"
        cancelLabel="No, keep editing" onCancel={() => setConfirmSave(false)} onConfirm={() => void handleSaveModal()}>
        <p>Update permissions for <strong>{editingUser.name || editingUser.email}</strong>?</p>
        <ul>
          {modalCanCancel !== editingUser.canCancelSales && <li>Cancel bills: {modalCanCancel ? 'On' : 'Off'}</li>}
          {modalCanReturn !== editingUser.canProcessReturns && <li>Process returns: {modalCanReturn ? 'On' : 'Off'}</li>}
          {stockChanged && <li>Enter stock counts: {modalCanAudit ? 'On' : 'Off'}</li>}
          {changedOverrides.map((key) => <li key={key}>{permissionProfile?.definitions[key]}: {overrides[key] === undefined ? 'Role default' : overrides[key] ? 'On' : 'Off'}</li>)}
        </ul>
      </ConfirmAction>}
    </div>
  );
}
