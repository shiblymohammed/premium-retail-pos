'use client';

import { ConfirmAction } from '@/components/ui/confirm-action';
import { Feedback } from '@/components/ui/feedback';
import {
  Ban,
  Check,
  ChevronDown,
  Clipboard,
  ClipboardCheck,
  CreditCard,
  FileText,
  Info,
  KeyRound,
  MapPin,
  Package,
  Pencil,
  ShieldCheck,
  Store,
  TriangleAlert,
  UserRound,
  UsersRound,
  X,
  Zap,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { clearStoredSession, getStoredSession, setStoredSession } from '@/lib/auth';
import { QuickAccessCard, AdminModal } from '@/components/admin';
import { AdminActionMenu } from '@/components/admin/admin-action-menu';

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
  lastReason?: string;
  lastUpdated?: string;
  locationScopes?: Array<{ locationId: string; location?: { name: string } }>;
}

export interface Authority {
  role: string;
  canCancelSales: boolean;
  canProcessReturns: boolean;
  permissionsInherited: boolean;
}

const ROLE_OPTIONS = [
  { value: 'ALL', label: 'All Roles' },
  { value: 'STORE_MANAGER', label: 'Store Manager' },
  { value: 'CASHIER', label: 'Cashier Station' },
  { value: 'CENTRAL_MANAGER', label: 'Central Warehouse' },
  { value: 'SUB_WAREHOUSE_MANAGER', label: 'Sub Warehouse' },
  { value: 'STAFF', label: 'Floor Staff' },
];

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

const CAPABILITY_OPTIONS = [
  { value: 'ALL', label: 'All Capabilities' },
  { value: 'CAN_CANCEL', label: 'Can Void / Cancel Sales' },
  { value: 'CAN_RETURN', label: 'Can Process Returns' },
  { value: 'CAN_AUDIT', label: 'Can Count Stock Audits' },
  { value: 'RESTRICTED', label: 'No Overrides (Standard)' },
];

async function errorMessage(response: Response) {
  try {
    const result = await response.json();
    return typeof result.message === 'string' ? result.message : 'Request failed';
  } catch {
    return `Request failed (${response.status})`;
  }
}

export default function SalesPermissionsAdmin() {
  // Navigation Tabs (Staff Permissions Matrix vs Standard Templates)
  const [activeTab, setActiveTab] = useState<'MATRIX' | 'TEMPLATES'>('MATRIX');

  // Session & Authority
  const [token, setToken] = useState<string>('');
  const [actorEmail, setActorEmail] = useState<string>('');
  const [authority, setAuthority] = useState<Authority>({
    role: '',
    canCancelSales: false,
    canProcessReturns: false,
    permissionsInherited: false,
  });

  // Data
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [capabilityFilter, setCapabilityFilter] = useState('ALL');

  // Dropdown Toggles
  const [openDropdown, setOpenDropdown] = useState<'ROLE' | 'LOCATION' | 'CAPABILITY' | null>(null);

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

  // Initialize from Session or API
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get('q');
    if (query) setSearch(query);
    const session = getStoredSession();
    if (session?.user?.email) {
      setActorEmail(session.user.email);
    }
    if (session?.user?.role) {
      setAuthority({
        role: session.user.role,
        canCancelSales: true,
        canProcessReturns: true,
        permissionsInherited: true,
      });
    }

    if (!session?.accessToken) {
      setError('Sign in with an administrator account to load live permissions.');
      setLoading(false);
      return;
    }
    setToken(session.accessToken);
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    Promise.all([
        fetch(`${API_BASE}/users/me/sales-permissions`, { headers, cache: 'no-store' }),
        fetch(`${API_BASE}/users?isActive=true`, { headers, cache: 'no-store' }),
        fetch(`${API_BASE}/locations?isActive=true`, { headers, cache: 'no-store' }),
      ])
        .then(async ([authRes, usersRes, locsRes]) => {
          const failed = [authRes, usersRes, locsRes].find((response) => !response.ok);
          if (failed) throw new Error(await errorMessage(failed));
          const [authData, usersData, locsData] = await Promise.all([
            authRes.json(),
            usersRes.json(),
            locsRes.json(),
          ]);
          if (authData?.data) setAuthority(authData.data);
          if (Array.isArray(usersData?.data)) {
            setUsers(usersData.data.filter(
              (u: UserRecord) => u.id !== session.user?.id && u.role !== 'SUPER_ADMIN',
            ));
          }
          if (Array.isArray(locsData?.data)) setLocations(locsData.data);
        })
        .catch((loadError: unknown) => {
          setError(loadError instanceof Error ? loadError.message : 'Could not load permissions from the server.');
        })
        .finally(() => setLoading(false));
  }, []);

  // Global click to dismiss menus
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.custom-filter-dropdown-wrap')) {
        setOpenDropdown(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

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

      let capabilityMatch = true;
      if (capabilityFilter === 'CAN_CANCEL') capabilityMatch = user.canCancelSales;
      else if (capabilityFilter === 'CAN_RETURN') capabilityMatch = user.canProcessReturns;
      else if (capabilityFilter === 'CAN_AUDIT') capabilityMatch = user.canCountStockAudits;
      else if (capabilityFilter === 'RESTRICTED') capabilityMatch = !user.canCancelSales && !user.canProcessReturns && !user.canCountStockAudits;

      return searchMatch && roleMatch && locationMatch && capabilityMatch;
    });
  }, [users, search, roleFilter, locationFilter, capabilityFilter, locationMap]);

  // KPI Metrics for Quick Access
  const kpis = useMemo(() => {
    const total = users.length;
    const managers = users.filter((u) => u.role === 'STORE_MANAGER');
    const cashiers = users.filter((u) => u.role === 'CASHIER');
    const canCancel = users.filter((u) => u.canCancelSales).length;
    const canReturn = users.filter((u) => u.canProcessReturns).length;
    const canAudit = users.filter((u) => u.canCountStockAudits).length;

    return {
      total,
      managers: managers.length,
      cashiers: cashiers.length,
      canCancel,
      canReturn,
      canAudit,
    };
  }, [users]);

  const resetAllFilters = () => {
    setSearch('');
    setRoleFilter('ALL');
    setLocationFilter('ALL');
    setCapabilityFilter('ALL');
  };

  // Open Edit Permissions Modal
  const openEditModal = (u: UserRecord) => {
    setError('');
    setEditingUser(u);
    setModalCanCancel(u.canCancelSales);
    setModalCanReturn(u.canProcessReturns);
    setModalCanAudit(u.canCountStockAudits);
    setModalReason('');
    setSelectedUserId(u.id);
  };

  function preparePreset(user: UserRecord, cancel: boolean, returns: boolean, count: boolean) {
    openEditModal(user);
    setModalCanCancel(cancel);
    setModalCanReturn(returns);
    setModalCanAudit(count);
  }

  // Save Modal Permissions
  const handleSaveModal = async () => {
    setConfirmSave(false);
    if (!editingUser || savingUserId) return;
    const reason = modalReason.trim();

    setSavingUserId(editingUser.id);
    setError('');
    let salesPermissionSaved = false;

    try {
      if (!token) throw new Error('No authenticated session. Sign in again and retry.');
      const salesRes = await fetch(`${API_BASE}/users/${editingUser.id}/sales-permissions`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canCancelSales: modalCanCancel,
            canProcessReturns: modalCanReturn,
            reason: reason || undefined,
          }),
        });
        if (!salesRes.ok) throw new Error(await errorMessage(salesRes));
        salesPermissionSaved = true;

        const auditRes = await fetch(`${API_BASE}/users/${editingUser.id}/stock-audit-permission`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canCountStockAudits: modalCanAudit,
            reason: reason || undefined,
          }),
        });
        if (!auditRes.ok) throw new Error(await errorMessage(auditRes));

      setUsers((prev) =>
        prev.map((item) =>
          item.id === editingUser.id
            ? {
                ...item,
                canCancelSales: modalCanCancel,
                canProcessReturns: modalCanReturn,
                canCountStockAudits: modalCanAudit,
                lastReason: reason || 'Permissions updated via admin console',
                lastUpdated: 'Today',
              }
            : item,
        ),
      );
      setEditingUser(null);
      setNotice(`Updated sales permissions for ${editingUser.name || editingUser.email}.`);
    } catch (saveError: unknown) {
      const detail = saveError instanceof Error ? saveError.message : 'Request failed.';
      setError(salesPermissionSaved
        ? `Sales permissions were saved, but the stock-audit permission was not confirmed. Refresh the page to load the server state. ${detail}`
        : `Permissions were not saved. ${detail}`);
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

      {/* Header: Title with Blue Badge, Section View Toggles, Info, and Primary Action Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 850, margin: 0, color: 'var(--retail-ink)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Sales Permissions & Overrides
            <span
              style={{
                display: 'inline-grid',
                placeItems: 'center',
                width: '34px',
                height: '34px',
                borderRadius: '9px',
                background: 'var(--retail-accent)',
                color: '#ffffff',
                fontSize: '18px',
                boxShadow: '0 3px 8px rgba(26, 98, 234, 0.25)',
              }}
              title="OD-08 Security Invariant"
            >
              <KeyRound size="1em" className="inline-icon" aria-hidden="true" />
            </span>
          </h1>
        </div>

        <div className="admin-heading-actions">
          <div style={{ display: 'inline-flex', background: 'var(--retail-edge)', padding: '3px', borderRadius: '8px', border: '1px solid var(--retail-edge-strong)' }}>
            <button
              type="button"
              onClick={() => setActiveTab('MATRIX')}
              style={{
                border: 'none',
                background: activeTab === 'MATRIX' ? 'var(--retail-card)' : 'transparent',
                color: activeTab === 'MATRIX' ? 'var(--retail-accent)' : 'var(--retail-muted)',
                padding: '6px 14px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: activeTab === 'MATRIX' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Staff Permissions Matrix
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('TEMPLATES')}
              style={{
                border: 'none',
                background: activeTab === 'TEMPLATES' ? 'var(--retail-card)' : 'transparent',
                color: activeTab === 'TEMPLATES' ? 'var(--retail-accent)' : 'var(--retail-muted)',
                padding: '6px 14px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: activeTab === 'TEMPLATES' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Standard Role Profiles
            </button>
          </div>

          {/* Directory Info Button */}
          <button
            type="button"
            onClick={() => setIsAuditModalOpen(true)}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: '1px solid var(--retail-edge-strong)',
              background: 'var(--retail-card)',
              color: 'var(--retail-muted)',
              fontSize: '16px',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
            title="View Invariant OD-08 Audit Architecture"
          >
            <Info size="1em" className="inline-icon" aria-hidden="true" />
          </button>

        </div>
      </div>

      {/* SECTION 1: QUICK ACCESS (4 Folder-Tabbed Cards) */}
      <details className="admin-shortcuts">
        <summary>Permission shortcuts <ChevronDown size={15} aria-hidden="true" /></summary>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
          {/* Card 1: Store Managers */}
          <QuickAccessCard
            isActive={roleFilter === 'STORE_MANAGER'}
            onClick={() => setRoleFilter(roleFilter === 'STORE_MANAGER' ? 'ALL' : 'STORE_MANAGER')}
            title="Filter by Store Managers"
            avatars={[
              { text: 'AP', bg: 'light-dark(#047857, #8be0ad)' },
              { text: 'SM', bg: '#0d9488' },
            ]}
            heading="Store Managers"
            subheading={`${kpis.managers} Supervisors · Full Voids & Returns`}
          />

          {/* Card 2: Cashiers & POS */}
          <QuickAccessCard
            isActive={roleFilter === 'CASHIER'}
            onClick={() => setRoleFilter(roleFilter === 'CASHIER' ? 'ALL' : 'CASHIER')}
            title="Filter by Cashiers"
            avatars={[
              { text: 'RM', bg: '#d97706' },
              { text: 'NS', bg: '#f59e0b' },
              { text: 'MD', bg: '#b45309' },
            ]}
            heading="Cashiers & POS"
            subheading={`${kpis.cashiers} Terminals · ${kpis.canReturn} Returns Allowed`}
          />

          {/* Card 3: Logistics & Audits */}
          <QuickAccessCard
            isActive={roleFilter === 'CENTRAL_MANAGER' || roleFilter === 'SUB_WAREHOUSE_MANAGER'}
            onClick={() => setRoleFilter(roleFilter === 'CENTRAL_MANAGER' ? 'ALL' : 'CENTRAL_MANAGER')}
            title="Filter by Warehouse Logistics"
            avatars={[
              { text: 'VS', bg: 'light-dark(#4f46e5, #bdb6ff)' },
              { text: 'RK', bg: '#6366f1' },
            ]}
            heading="Warehouse Logistics"
            subheading={`${kpis.canAudit} Authorized Stock Auditors`}
          />

          {/* Summary Card 4: OD-08 Security Invariant */}
          <div
            className="drive-folder-card"
            onClick={() => setIsAuditModalOpen(true)}
            title="View Security Invariant OD-08 Architecture"
            style={{ borderLeft: '4px solid var(--retail-accent)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px', color: 'var(--retail-accent)' }}><FileText size="1em" className="inline-icon" aria-hidden="true" /></span>
                <strong style={{ fontSize: '13.5px', color: 'var(--retail-ink)' }}>OD-08 Invariant</strong>
              </div>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'var(--retail-accent)',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 750,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                SA
              </div>
            </div>
            <div style={{ marginTop: '16px' }}>
              <small style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--retail-muted)', textTransform: 'uppercase', display: 'block' }}>
                GOVERNANCE
              </small>
              <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--retail-ink)', display: 'block', marginTop: '2px' }}>
                Void Reason Logging · Immutable Records
              </span>
            </div>
          </div>
        </div>
      </details>

      {/* VIEW TAB 1: PERMISSIONS MATRIX */}
      {activeTab === 'MATRIX' && (
        <div>
          {/* Section 2 Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--retail-muted)', textTransform: 'uppercase', margin: 0 }}>
              SALES PERMISSION DIRECTORY ({filteredUsers.length})
            </h2>

            {/* Filter Toolbar matching users, company, discount-limits */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Filter staff by name, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '18px',
                  border: '1px solid light-dark(#cbd5e1, #34455a)',
                  fontSize: '12.5px',
                  outline: 'none',
                  background: 'var(--retail-raised)',
                  minWidth: '220px',
                }}
              />

              {/* Custom Styled Role Dropdown */}
              <div className="custom-filter-dropdown-wrap" style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setOpenDropdown(openDropdown === 'ROLE' ? null : 'ROLE')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    borderRadius: '20px',
                    border: roleFilter !== 'ALL' ? '1px solid var(--retail-accent-line)' : '1px solid var(--retail-edge-strong)',
                    background: roleFilter !== 'ALL' ? 'var(--retail-accent-soft)' : 'var(--retail-card)',
                    color: roleFilter !== 'ALL' ? 'var(--retail-accent-strong)' : 'var(--retail-ink)',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span><UserRound size="1em" className="inline-icon" aria-hidden="true" /></span>
                  <span>{roleLabels[roleFilter] || 'All Roles'}</span>
                  <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '2px' }}><ChevronDown size="1em" className="inline-icon" aria-hidden="true" /></span>
                </button>

                {openDropdown === 'ROLE' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      width: '210px',
                      background: 'var(--retail-card)',
                      borderRadius: '12px',
                      border: '1px solid var(--retail-edge-strong)',
                      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
                      padding: '6px',
                      zIndex: 60,
                    }}
                  >
                    <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      FILTER BY ROLE
                    </div>
                    {ROLE_OPTIONS.map((opt) => {
                      const isSelected = roleFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setRoleFilter(opt.value);
                            setOpenDropdown(null);
                          }}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '8px',
                            border: 'none',
                            background: isSelected ? 'var(--retail-accent-soft)' : 'transparent',
                            color: isSelected ? 'var(--retail-accent)' : 'var(--retail-ink)',
                            fontSize: '12px',
                            fontWeight: isSelected ? 700 : 500,
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'var(--retail-raised)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <span style={{ color: 'var(--retail-accent)', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Custom Styled Location Dropdown */}
              <div className="custom-filter-dropdown-wrap" style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setOpenDropdown(openDropdown === 'LOCATION' ? null : 'LOCATION')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    borderRadius: '20px',
                    border: locationFilter !== 'ALL' ? '1px solid var(--retail-accent-line)' : '1px solid var(--retail-edge-strong)',
                    background: locationFilter !== 'ALL' ? 'var(--retail-accent-soft)' : 'var(--retail-card)',
                    color: locationFilter !== 'ALL' ? 'var(--retail-accent-strong)' : 'var(--retail-ink)',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span><MapPin size="1em" className="inline-icon" aria-hidden="true" /></span>
                  <span>{locationFilter === 'ALL' ? 'All Locations' : locationMap.get(locationFilter) || locationFilter}</span>
                  <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '2px' }}><ChevronDown size="1em" className="inline-icon" aria-hidden="true" /></span>
                </button>

                {openDropdown === 'LOCATION' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      width: '230px',
                      background: 'var(--retail-card)',
                      borderRadius: '12px',
                      border: '1px solid var(--retail-edge-strong)',
                      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
                      padding: '6px',
                      zIndex: 60,
                    }}
                  >
                    <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      FILTER BY STORE LOCATION
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLocationFilter('ALL');
                        setOpenDropdown(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        border: 'none',
                        background: locationFilter === 'ALL' ? 'var(--retail-accent-soft)' : 'transparent',
                        color: locationFilter === 'ALL' ? 'var(--retail-accent)' : 'var(--retail-ink)',
                        fontSize: '12px',
                        fontWeight: locationFilter === 'ALL' ? 700 : 500,
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                    >
                      <span>All Locations</span>
                      {locationFilter === 'ALL' && <span style={{ color: 'var(--retail-accent)', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
                    </button>
                    {locations.map((loc) => (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => {
                          setLocationFilter(loc.id);
                          setOpenDropdown(null);
                        }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          border: 'none',
                          background: locationFilter === loc.id ? 'var(--retail-accent-soft)' : 'transparent',
                          color: locationFilter === loc.id ? 'var(--retail-accent)' : 'var(--retail-ink)',
                          fontSize: '12px',
                          fontWeight: locationFilter === loc.id ? 700 : 500,
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                        }}
                      >
                        <span>{loc.name}</span>
                        {locationFilter === loc.id && <span style={{ color: 'var(--retail-accent)', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Custom Styled Capability Dropdown */}
              <div className="custom-filter-dropdown-wrap" style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setOpenDropdown(openDropdown === 'CAPABILITY' ? null : 'CAPABILITY')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    borderRadius: '20px',
                    border: capabilityFilter !== 'ALL' ? '1px solid var(--retail-accent-line)' : '1px solid var(--retail-edge-strong)',
                    background: capabilityFilter !== 'ALL' ? 'var(--retail-accent-soft)' : 'var(--retail-card)',
                    color: capabilityFilter !== 'ALL' ? 'var(--retail-accent-strong)' : 'var(--retail-ink)',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span><Zap size="1em" className="inline-icon" aria-hidden="true" /></span>
                  <span>{CAPABILITY_OPTIONS.find((c) => c.value === capabilityFilter)?.label || 'All Capabilities'}</span>
                  <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '2px' }}><ChevronDown size="1em" className="inline-icon" aria-hidden="true" /></span>
                </button>

                {openDropdown === 'CAPABILITY' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      width: '230px',
                      background: 'var(--retail-card)',
                      borderRadius: '12px',
                      border: '1px solid var(--retail-edge-strong)',
                      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
                      padding: '6px',
                      zIndex: 60,
                    }}
                  >
                    <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      FILTER BY PERMISSION
                    </div>
                    {CAPABILITY_OPTIONS.map((opt) => {
                      const isSelected = capabilityFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setCapabilityFilter(opt.value);
                            setOpenDropdown(null);
                          }}
                          style={{
                            width: '100%',
                            padding: '7px 10px',
                            borderRadius: '8px',
                            border: 'none',
                            background: isSelected ? 'var(--retail-accent-soft)' : 'transparent',
                            color: isSelected ? 'var(--retail-accent)' : 'var(--retail-ink)',
                            fontSize: '12px',
                            fontWeight: isSelected ? 700 : 500,
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                          }}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <span style={{ color: 'var(--retail-accent)', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reset Filters Link */}
              {(search || roleFilter !== 'ALL' || locationFilter !== 'ALL' || capabilityFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--retail-accent)',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Reset Filters
                </button>
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
                        <p style={{ margin: '4px 0 0', fontSize: '12px' }}>Try resetting the filters or provision a new user override.</p>
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
                              {/* Edit Permissions Button */}
                              <button
                                type="button"
                                onClick={() => openEditModal(user)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: 'light-dark(#eff6ff, #1d2733)',
                                  border: '1px solid light-dark(#bfdbfe, #2e425b)',
                                  color: 'var(--retail-accent)',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.12s ease',
                                }}
                                title="Configure user permissions"
                              >
                                Edit
                              </button>

                              <AdminActionMenu label={`Permission actions for ${user.name || user.email}`}>
                                <button type="button" onClick={() => openEditModal(user)}><Pencil size={15} aria-hidden="true" /> Configure permissions</button>
                                <button type="button" onClick={() => preparePreset(user, true, true, false)}><Zap size={15} aria-hidden="true" /> Grant voids and returns</button>
                                <button type="button" onClick={() => preparePreset(user, false, true, false)}><Zap size={15} aria-hidden="true" /> Grant returns only</button>
                                <button type="button" onClick={() => preparePreset(user, false, false, true)}><Package size={15} aria-hidden="true" /> Grant stock audit count</button>
                                <button type="button" className="admin-action-danger" onClick={() => preparePreset(user, false, false, false)}><Ban size={15} aria-hidden="true" /> Revoke all overrides</button>
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
      )}

      {/* VIEW TAB 2: ROLE STANDARDS */}
      {activeTab === 'TEMPLATES' && (
        <div>
          <div style={{ marginBottom: '18px', fontSize: '12.5px', fontWeight: 850, color: 'var(--retail-ink)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            ORGANIZATIONAL ROLE PERMISSION STANDARDS
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px', marginBottom: '30px' }}>
            {/* Store Managers Standard */}
            <div style={{ background: 'var(--retail-card)', borderRadius: '14px', border: '1px solid var(--retail-edge)', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'light-dark(#059669, #b5f5e1)', background: 'light-dark(#ecfdf5, #1e352a)', padding: '4px 10px', borderRadius: '20px', border: '1px solid light-dark(#a7f3d0, #31624b)' }}>
                  MANAGEMENT TIER
                </span>
                <span style={{ fontSize: '18px', fontWeight: 850, color: 'light-dark(#059669, #b5f5e1)' }}>Store access</span>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 8px', color: 'var(--retail-ink)' }}>Store Managers</h3>
              <p style={{ fontSize: '13.5px', color: 'var(--retail-muted)', lineHeight: 1.5, margin: '0 0 16px' }}>
                The workflow assigns customer returns to store managers. Cancelling a bill requires separate authorization. Review each account’s saved permissions in the directory.
              </p>
              <div style={{ fontSize: '12.5px', color: 'var(--retail-ink)', background: 'var(--retail-raised)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--retail-edge-strong)', fontWeight: 550 }}>
                <strong>Workflow:</strong> Customer returns and stock counts at assigned stores.
              </div>
            </div>

            {/* Cashiers Standard */}
            <div style={{ background: 'var(--retail-card)', borderRadius: '14px', border: '1px solid var(--retail-edge)', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--retail-accent)', background: 'light-dark(#eff6ff, #1d2733)', padding: '4px 10px', borderRadius: '20px', border: '1px solid light-dark(#bfdbfe, #2e425b)' }}>
                  OPERATIONAL TIER
                </span>
                <span style={{ fontSize: '18px', fontWeight: 850, color: 'var(--retail-accent)' }}>Role Controlled</span>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 8px', color: 'var(--retail-ink)' }}>Cashier Terminal Stations</h3>
              <p style={{ fontSize: '13.5px', color: 'var(--retail-muted)', lineHeight: 1.5, margin: '0 0 16px' }}>
                Standard cashiers can execute checkouts. Senior cashiers or returns desk staff can be provisioned with returns handling privileges as needed.
              </p>
              <div style={{ fontSize: '12.5px', color: 'var(--retail-ink)', background: 'var(--retail-raised)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--retail-edge-strong)', fontWeight: 550 }}>
                <strong>Workflow:</strong> Checkout. Sales controls require explicitly granted access.
              </div>
            </div>

            {/* Warehouse Standard */}
            <div style={{ background: 'var(--retail-card)', borderRadius: '14px', border: '1px solid var(--retail-edge)', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'light-dark(#4f46e5, #bdb6ff)', background: 'light-dark(#eef2ff, #1d2233)', padding: '4px 10px', borderRadius: '20px', border: '1px solid light-dark(#c7d2fe, #2d3659)' }}>
                  LOGISTICS TIER
                </span>
                <span style={{ fontSize: '18px', fontWeight: 850, color: 'light-dark(#4f46e5, #bdb6ff)' }}>Stock Auditor</span>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 8px', color: 'var(--retail-ink)' }}>Warehouse Logistics</h3>
              <p style={{ fontSize: '13.5px', color: 'var(--retail-muted)', lineHeight: 1.5, margin: '0 0 16px' }}>
                Warehouse and depot managers hold physical inventory counting authority. They cannot execute POS sales cancellations or register refunds.
              </p>
              <div style={{ fontSize: '12.5px', color: 'var(--retail-ink)', background: 'var(--retail-raised)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--retail-edge-strong)', fontWeight: 550 }}>
                <strong>Authorized:</strong> Stock Audit Count <Check size="1em" className="inline-icon" aria-hidden="true" /> · Sales POS (Restricted <X size="1em" className="inline-icon" aria-hidden="true" />)
              </div>
            </div>
          </div>

          {/* Deep Invariant Architecture Callout */}
          <div
            style={{
              background: 'var(--retail-card)',
              borderRadius: '14px',
              border: '1px solid var(--retail-edge)',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '22px' }}><ShieldCheck size="1em" className="inline-icon" aria-hidden="true" /></span>
              <h2 style={{ fontSize: '18px', fontWeight: 850, margin: 0, color: 'var(--retail-ink)' }}>
                OD-08 Security Invariant Architecture
              </h2>
            </div>
            <div style={{ fontSize: '13.5px', color: 'var(--retail-ink)', lineHeight: 1.6, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '14px' }}>
              <div>
                <strong style={{ color: 'var(--retail-ink)', display: 'block', marginBottom: '4px', fontSize: '14px' }}>1. Scoped POS Enforcement</strong>
                Permissions are validated cryptographically against JWT tokens and store location scopes upon invoice cancellation or return initiation.
              </div>
              <div>
                <strong style={{ color: 'var(--retail-ink)', display: 'block', marginBottom: '4px', fontSize: '14px' }}>2. Mandatory Cancellation Reason</strong>
                Every invoice void requires selecting a business cancellation code and entering an audit justification note recorded in the immutable ledger.
              </div>
              <div>
                <strong style={{ color: 'var(--retail-ink)', display: 'block', marginBottom: '4px', fontSize: '14px' }}>3. Segregation of Stock Auditing</strong>
                Stock audit count permissions remain strictly decoupled from cashier sales checkout, preventing unmonitored inventory adjustments.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT USER PERMISSIONS (Matching modal style of /admin/users, /admin/company, /admin/discount-limits) */}
      {editingUser && (
        <div
          className="admin-dialog-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
            padding: '20px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingUser(null);
          }}
        >
          <div
            role="dialog" aria-modal="true" aria-labelledby="permission-editor-title"
            onKeyDown={(event) => { if (event.key === 'Escape') setEditingUser(null); }}
            style={{
              background: 'var(--retail-card)',
              borderRadius: '16px',
              width: 'min(520px, 100%)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
              padding: 'clamp(14px, 3vw, 26px)',
              maxHeight: 'calc(100dvh - 40px)',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h2 id="permission-editor-title" style={{ fontSize: '18px', fontWeight: 850, margin: 0, color: 'var(--retail-ink)' }}>
                  Configure Staff Sales Permissions
                </h2>
                <div style={{ fontSize: '12.5px', color: 'var(--retail-muted)', marginTop: '2px' }}>
                  {editingUser.name || editingUser.email} · {roleLabels[editingUser.role] || editingUser.role}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                autoFocus
                onClick={() => setEditingUser(null)}
                style={{ border: 'none', background: 'var(--retail-edge)', borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', fontSize: '14px', color: 'var(--retail-muted)' }}
              >
                <X size="1em" className="inline-icon" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={(event) => { event.preventDefault(); if (modalReason.trim()) setConfirmSave(true); else setError('Enter a reason for changing access.'); }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {error && <Feedback tone="error">{error}</Feedback>}
              {/* Permission Toggles List */}
              <div style={{ background: 'var(--retail-raised)', padding: '16px', borderRadius: '12px', border: '1px solid var(--retail-edge-strong)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Toggle 1: Cancel Sales */}
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--retail-ink)', display: 'block' }}>Cancel finalized bills</strong>
                    <span style={{ fontSize: '11.5px', color: 'var(--retail-muted)' }}>Permits cancelling receipts on POS terminals (Requires justification)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={modalCanCancel}
                    onChange={(e) => setModalCanCancel(e.target.checked)}
                    role="switch"
                    className="admin-permission-switch"
                  />
                </label>

                <div style={{ height: '1px', background: 'var(--retail-edge)' }} />

                {/* Toggle 2: Process Returns */}
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--retail-ink)', display: 'block' }}>Process customer returns</strong>
                    <span style={{ fontSize: '11.5px', color: 'var(--retail-muted)' }}>Permits accepting returned items and issuing credit vouchers</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={modalCanReturn}
                    onChange={(e) => setModalCanReturn(e.target.checked)}
                    role="switch"
                    className="admin-permission-switch"
                  />
                </label>

                <div style={{ height: '1px', background: 'var(--retail-edge)' }} />

                {/* Toggle 3: Stock Audits */}
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--retail-ink)', display: 'block' }}>Enter stock counts</strong>
                    <span style={{ fontSize: '11.5px', color: 'var(--retail-muted)' }}>Permits counting inventory on /audits during stock reconciliation</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={modalCanAudit}
                    onChange={(e) => setModalCanAudit(e.target.checked)}
                    role="switch"
                    className="admin-permission-switch"
                  />
                </label>
              </div>

              {/* Justification Reason Field */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 750, color: 'var(--retail-ink)', marginBottom: '6px' }}>
                  Reason for changing access
                </label>
                <textarea
                  rows={3}
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  placeholder="Enter reason for granting or revoking these operational permissions..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid light-dark(#cbd5e1, #34455a)',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    color: 'var(--retail-ink)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  required
                />
              </div>

              {/* Form Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  style={{ padding: '9px 16px', borderRadius: '8px', background: 'var(--retail-edge)', border: 'none', color: 'var(--retail-muted)', fontSize: '13px', fontWeight: 650, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUserId === editingUser.id}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    background: 'var(--retail-accent)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 750,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(26, 98, 234, 0.28)',
                  }}
                >
                  {savingUserId === editingUser.id ? 'Saving…' : 'Save Permissions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AUDIT TRAIL LOGS */}
      {isAuditModalOpen && (
        <div
          className="admin-dialog-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
            padding: '20px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAuditModalOpen(false);
          }}
        >
          <div
            style={{
              background: 'var(--retail-card)',
              borderRadius: '16px',
              width: 'min(720px, 100%)',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
              padding: '26px',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '22px' }}><ClipboardCheck size="1em" className="inline-icon" aria-hidden="true" /></span>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 850, margin: 0, color: 'var(--retail-ink)' }}>
                    Sales Permission Audit Trail (OD-08)
                  </h2>
                  <span style={{ fontSize: '12px', color: 'var(--retail-muted)' }}>
                    Immutable historical ledger of sales void and return authorizations
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setIsAuditModalOpen(false)}
                style={{ border: 'none', background: 'var(--retail-edge)', borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', fontSize: '15px', fontWeight: 800, color: 'var(--retail-muted)' }}
              >
                <X size="1em" className="inline-icon" aria-hidden="true" />
              </button>
            </div>

            <div style={{ background: 'var(--retail-raised)', borderRadius: '10px', padding: '12px 14px', border: '1px solid var(--retail-edge-strong)', marginBottom: '16px', fontSize: '12.5px', color: 'var(--retail-ink)', lineHeight: 1.5 }}>
              Each time an administrator updates sales permissions, the system immutably logs the <strong>target account</strong>, <strong>administrator account ID</strong>, <strong>timestamp</strong>, and <strong>mandatory business reason</strong>.
            </div>

            {/* Audit Log Entries Table */}
            <div style={{ border: '1px solid var(--retail-edge-strong)', borderRadius: '10px', overflow: 'hidden', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 150px 110px 1fr', padding: '9px 12px', background: 'var(--retail-edge)', fontSize: '10.5px', fontWeight: 800, color: 'var(--retail-ink)', textTransform: 'uppercase' }}>
                <div>Timestamp</div>
                <div>Target Account</div>
                <div>Privilege Delta</div>
                <div>Justification Reason</div>
              </div>

              {Array.from([] as Array<{ time: string; target: string; delta: string; reason: string }>).map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 150px 110px 1fr',
                    padding: '11px 12px',
                    borderTop: '1px solid var(--retail-edge)',
                    fontSize: '12px',
                    color: 'var(--retail-ink)',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ color: 'var(--retail-muted)', fontSize: '11.5px' }}>{entry.time}</div>
                  <div style={{ fontWeight: 700 }}>{entry.target.split('@')[0]}</div>
                  <div>
                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'light-dark(#eff6ff, #1d2733)', color: 'var(--retail-accent)', fontWeight: 750, fontSize: '11px' }}>
                      {entry.delta}
                    </span>
                  </div>
                  <div style={{ color: 'var(--retail-muted)', fontSize: '11.5px' }}>{entry.reason}</div>
                </div>
              ))}
              <p style={{ margin: 0, padding: 18, color: 'var(--retail-muted)', fontSize: 13 }}>No permission changes have been recorded yet.</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: 'var(--retail-accent)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '12.5px',
                  fontWeight: 750,
                  cursor: 'pointer',
                }}
              >
                Close Audit Log
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmSave && editingUser && <ConfirmAction title="Save access changes?" confirmLabel="Yes, save changes"
        cancelLabel="No, keep editing" onCancel={() => setConfirmSave(false)} onConfirm={() => void handleSaveModal()}>
        <p>Update permissions for <strong>{editingUser.name || editingUser.email}</strong>?</p>
        <ul>
          <li>Cancel bills: {modalCanCancel ? 'On' : 'Off'}</li>
          <li>Process returns: {modalCanReturn ? 'On' : 'Off'}</li>
          <li>Enter stock counts: {modalCanAudit ? 'On' : 'Off'}</li>
        </ul>
      </ConfirmAction>}
    </div>
  );
}
