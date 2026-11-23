'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { clearStoredSession, getStoredSession, setStoredSession } from '@/lib/auth';
import { QuickAccessCard, AdminModal } from '@/components/admin';

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
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);

  // Selected row for highlight
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Status & Feedback
  const [savingUserId, setSavingUserId] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Modals
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkRole, setBulkRole] = useState<'CASHIER' | 'STORE_MANAGER' | 'STAFF'>('CASHIER');
  const [bulkCanCancel, setBulkCanCancel] = useState(true);
  const [bulkCanReturn, setBulkCanReturn] = useState(true);
  const [bulkCanAudit, setBulkCanAudit] = useState(false);
  const [bulkReason, setBulkReason] = useState('Enterprise POS operational role standard update');

  // Edit Permissions Modal
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [modalCanCancel, setModalCanCancel] = useState(false);
  const [modalCanReturn, setModalCanReturn] = useState(false);
  const [modalCanAudit, setModalCanAudit] = useState(false);
  const [modalReason, setModalReason] = useState('');

  // Initialize from Session or API
  useEffect(() => {
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
              (u: UserRecord) => u.email.toLowerCase() !== session.user?.email.toLowerCase(),
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
      if (!target.closest('.perm-action-menu-wrap')) {
        setActiveActionMenuId(null);
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
    setEditingUser(u);
    setModalCanCancel(u.canCancelSales);
    setModalCanReturn(u.canProcessReturns);
    setModalCanAudit(u.canCountStockAudits);
    setModalReason('');
    setSelectedUserId(u.id);
  };

  // Save Modal Permissions
  const handleSaveModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
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
  const applyQuickPreset = async (
    user: UserRecord,
    cancel: boolean,
    returns: boolean,
    audit: boolean,
    label: string,
  ) => {
    const reason = `Fast-assigned ${label} via directory quick action`;
    setSavingUserId(user.id);
    setActiveActionMenuId(null);

    try {
      if (!token) throw new Error('No authenticated session. Sign in again and retry.');
      const responses = await Promise.all([
          fetch(`${API_BASE}/users/${user.id}/sales-permissions`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ canCancelSales: cancel, canProcessReturns: returns, reason }),
          }),
          fetch(`${API_BASE}/users/${user.id}/stock-audit-permission`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ canCountStockAudits: audit, reason }),
          }),
        ]);
      const failed = responses.find((response) => !response.ok);
      if (failed) throw new Error(await errorMessage(failed));
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id
            ? {
                ...item,
                canCancelSales: cancel,
                canProcessReturns: returns,
                canCountStockAudits: audit,
                lastReason: reason,
                lastUpdated: 'Today',
              }
            : item,
        ),
      );
      setNotice(`Assigned ${label} to ${user.name || user.email}.`);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? `Preset was not confirmed by the server. ${saveError.message}` : 'Preset was not saved.');
    } finally {
      setSavingUserId('');
    }
  };

  // Bulk Apply
  const handleApplyBulk = (e: FormEvent) => {
    e.preventDefault();
    setError('Bulk permission changes are not supported by the API yet. Use the per-user permission editor so each change is recorded by the server.');
  };

  // Copy User Policy
  const copyUserPolicy = (u: UserRecord) => {
    const scopes = (u.locationScopes || [])
      .map((s) => locationMap.get(s.locationId) || s.locationId)
      .join(', ') || 'Platform-wide';
    const voids = u.canCancelSales ? 'Allowed' : 'Blocked';
    const returns = u.canProcessReturns ? 'Allowed' : 'Blocked';
    const audits = u.canCountStockAudits ? 'Authorized' : 'Restricted';
    const text = `Staff: ${u.name || u.email} | Role: ${roleLabels[u.role] || u.role} | Sales Voids: ${voids} | Returns: ${returns} | Audits: ${audits} | Stores: ${scopes} | OD-08 Enforced`;
    navigator.clipboard.writeText(text);
    setNotice(`Copied permissions profile for ${u.name || u.email} to clipboard.`);
  };

  return (
    <div className="app-page" style={{ color: '#1e293b' }}>
      {/* Alert Notice (Matching users, company, discount-limits) */}
      {notice && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            fontSize: '13px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.1)',
          }}
        >
          <span style={{ fontWeight: 600 }}>✓ {notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            style={{ background: 'none', border: 'none', color: '#065f46', cursor: 'pointer', fontWeight: 800, fontSize: '14px' }}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            fontSize: '13px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.1)',
          }}
        >
          <span style={{ fontWeight: 600 }}>⚠ {error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontWeight: 800, fontSize: '14px' }}
          >
            ✕
          </button>
        </div>
      )}
      {loading && (
        <div role="status" style={{ padding: '12px 16px', marginBottom: '16px', borderRadius: '9px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '13px' }}>
          Loading current permissions from the server…
        </div>
      )}

      {/* Header: Title with Blue Badge, Section View Toggles, Info, and Primary Action Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 850, margin: 0, color: '#1e293b', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Sales Permissions & Overrides
            <span
              style={{
                display: 'inline-grid',
                placeItems: 'center',
                width: '34px',
                height: '34px',
                borderRadius: '9px',
                background: '#1a62ea',
                color: '#ffffff',
                fontSize: '18px',
                boxShadow: '0 3px 8px rgba(26, 98, 234, 0.25)',
              }}
              title="OD-08 Security Invariant"
            >
              🔑
            </span>
          </h1>
        </div>

        {/* Right side: View Tabs, Info button, and Primary Action Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={() => setActiveTab('MATRIX')}
              style={{
                border: 'none',
                background: activeTab === 'MATRIX' ? '#ffffff' : 'transparent',
                color: activeTab === 'MATRIX' ? '#1a62ea' : '#64748b',
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
                background: activeTab === 'TEMPLATES' ? '#ffffff' : 'transparent',
                color: activeTab === 'TEMPLATES' ? '#1a62ea' : '#64748b',
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
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#64748b',
              fontSize: '16px',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
            title="View Invariant OD-08 Audit Architecture"
          >
            ⓘ
          </button>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={() => setIsBulkModalOpen(true)}
            disabled={loading || users.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '8px',
              background: '#1a62ea',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              fontSize: '13px',
              cursor: loading || users.length === 0 ? 'not-allowed' : 'pointer',
              opacity: loading || users.length === 0 ? 0.55 : 1,
              boxShadow: '0 2px 10px rgba(26, 98, 234, 0.28)',
            }}
          >
            <span style={{ fontSize: '15px' }}>⚡</span> Bulk Permissions Preset
          </button>
        </div>
      </div>

      {/* SECTION 1: QUICK ACCESS (4 Folder-Tabbed Cards) */}
      <div style={{ marginBottom: '34px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: '#475569', textTransform: 'uppercase', margin: '0 0 14px' }}>
          QUICK ACCESS
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
          {/* Card 1: Store Managers */}
          <QuickAccessCard
            isActive={roleFilter === 'STORE_MANAGER'}
            onClick={() => setRoleFilter(roleFilter === 'STORE_MANAGER' ? 'ALL' : 'STORE_MANAGER')}
            title="Filter by Store Managers"
            avatars={[
              { text: 'AP', bg: '#059669' },
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
              { text: 'VS', bg: '#4f46e5' },
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
            style={{ borderLeft: '4px solid #1a62ea' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px', color: '#1a62ea' }}>🗎</span>
                <strong style={{ fontSize: '13.5px', color: '#1e293b' }}>OD-08 Invariant</strong>
              </div>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: '#1a62ea',
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
              <small style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase', display: 'block' }}>
                GOVERNANCE
              </small>
              <span style={{ fontSize: '12px', fontWeight: 650, color: '#334155', display: 'block', marginTop: '2px' }}>
                Void Reason Logging · Immutable Records
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW TAB 1: PERMISSIONS MATRIX */}
      {activeTab === 'MATRIX' && (
        <div>
          {/* Section 2 Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: '#475569', textTransform: 'uppercase', margin: 0 }}>
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
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px',
                  outline: 'none',
                  background: '#f8fafc',
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
                    border: roleFilter !== 'ALL' ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                    background: roleFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
                    color: roleFilter !== 'ALL' ? '#1d4ed8' : '#334155',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span>👤</span>
                  <span>{roleLabels[roleFilter] || 'All Roles'}</span>
                  <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '2px' }}>▼</span>
                </button>

                {openDropdown === 'ROLE' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      width: '210px',
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
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
                            background: isSelected ? '#eff6ff' : 'transparent',
                            color: isSelected ? '#1a62ea' : '#1e293b',
                            fontSize: '12px',
                            fontWeight: isSelected ? 700 : 500,
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <span>{opt.label}</span>
                          {isSelected && <span style={{ color: '#1a62ea', fontWeight: 800 }}>✓</span>}
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
                    border: locationFilter !== 'ALL' ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                    background: locationFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
                    color: locationFilter !== 'ALL' ? '#1d4ed8' : '#334155',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span>⌖</span>
                  <span>{locationFilter === 'ALL' ? 'All Locations' : locationMap.get(locationFilter) || locationFilter}</span>
                  <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '2px' }}>▼</span>
                </button>

                {openDropdown === 'LOCATION' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      width: '230px',
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
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
                        background: locationFilter === 'ALL' ? '#eff6ff' : 'transparent',
                        color: locationFilter === 'ALL' ? '#1a62ea' : '#1e293b',
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
                      {locationFilter === 'ALL' && <span style={{ color: '#1a62ea', fontWeight: 800 }}>✓</span>}
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
                          background: locationFilter === loc.id ? '#eff6ff' : 'transparent',
                          color: locationFilter === loc.id ? '#1a62ea' : '#1e293b',
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
                        {locationFilter === loc.id && <span style={{ color: '#1a62ea', fontWeight: 800 }}>✓</span>}
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
                    border: capabilityFilter !== 'ALL' ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                    background: capabilityFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
                    color: capabilityFilter !== 'ALL' ? '#1d4ed8' : '#334155',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span>⚡</span>
                  <span>{CAPABILITY_OPTIONS.find((c) => c.value === capabilityFilter)?.label || 'All Capabilities'}</span>
                  <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '2px' }}>▼</span>
                </button>

                {openDropdown === 'CAPABILITY' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      width: '230px',
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
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
                            background: isSelected ? '#eff6ff' : 'transparent',
                            color: isSelected ? '#1a62ea' : '#1e293b',
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
                          {isSelected && <span style={{ color: '#1a62ea', fontWeight: 800 }}>✓</span>}
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
                    color: '#1a62ea',
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
              background: '#ffffff',
              border: '1px solid #eef2f6',
              borderRadius: '14px',
              overflow: 'hidden',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid #edf2f7',
                      background: '#ffffff',
                      color: '#64748b',
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
                      <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔑</div>
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
                            borderBottom: '1px solid #f1f5f9',
                            background: isSelected ? '#edf4fe' : '#ffffff',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease',
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = '#f8fafd';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = '#ffffff';
                          }}
                        >
                          {/* Col 1: Staff Account */}
                          <td style={{ padding: '13px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  background: user.role === 'STORE_MANAGER' ? '#ecfdf5' : user.role === 'CASHIER' ? '#eff6ff' : '#f1f5f9',
                                  color: user.role === 'STORE_MANAGER' ? '#059669' : user.role === 'CASHIER' ? '#1a62ea' : '#475569',
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
                                  <span style={{ fontSize: '13px', fontWeight: 750, color: '#1e293b' }}>
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
                                <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
                                  <span>{user.email}</span>
                                  <span>·</span>
                                  <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{user.employeeCode || user.id.slice(0, 8)}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Col 2: Role */}
                          <td style={{ padding: '13px 16px' }}>
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
                                    ? '#ecfdf5'
                                    : user.role === 'CASHIER'
                                    ? '#eff6ff'
                                    : user.role.includes('WAREHOUSE')
                                    ? '#eef2ff'
                                    : '#f1f5f9',
                                color:
                                  user.role === 'STORE_MANAGER'
                                    ? '#059669'
                                    : user.role === 'CASHIER'
                                    ? '#1a62ea'
                                    : user.role.includes('WAREHOUSE')
                                    ? '#4f46e5'
                                    : '#475569',
                                border: `1px solid ${
                                  user.role === 'STORE_MANAGER'
                                    ? '#a7f3d0'
                                    : user.role === 'CASHIER'
                                    ? '#bfdbfe'
                                    : user.role.includes('WAREHOUSE')
                                    ? '#c7d2fe'
                                    : '#e2e8f0'
                                }`,
                              }}
                            >
                              <span>{user.role === 'STORE_MANAGER' ? '♛' : user.role === 'CASHIER' ? '♙' : '♟'}</span>
                              <span>{roleLabels[user.role] || user.role}</span>
                            </span>
                          </td>

                          {/* Col 3: Assigned Store */}
                          <td style={{ padding: '13px 16px' }}>
                            <div style={{ fontSize: '12.5px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                              <span style={{ color: '#1a62ea', fontSize: '13px' }}>🏪</span>
                              <span>{scopes.length ? scopes[0] : 'All Branches'}</span>
                              {scopes.length > 1 && (
                                <span style={{ fontSize: '10.5px', padding: '1px 5px', borderRadius: '4px', background: '#e2e8f0', color: '#475569', fontWeight: 750 }}>
                                  +{scopes.length - 1}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Col 4: Sales Voids (Clean Pill) */}
                          <td style={{ padding: '13px 14px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 750,
                                background: user.canCancelSales ? '#ecfdf5' : '#f8fafc',
                                color: user.canCancelSales ? '#059669' : '#94a3b8',
                                border: `1px solid ${user.canCancelSales ? '#a7f3d0' : '#e2e8f0'}`,
                              }}
                            >
                              <span>{user.canCancelSales ? '✓ Authorized' : '✕ Blocked'}</span>
                            </span>
                          </td>

                          {/* Col 5: Customer Returns (Clean Pill) */}
                          <td style={{ padding: '13px 14px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 750,
                                background: user.canProcessReturns ? '#ecfdf5' : '#f8fafc',
                                color: user.canProcessReturns ? '#059669' : '#94a3b8',
                                border: `1px solid ${user.canProcessReturns ? '#a7f3d0' : '#e2e8f0'}`,
                              }}
                            >
                              <span>{user.canProcessReturns ? '✓ Authorized' : '✕ Blocked'}</span>
                            </span>
                          </td>

                          {/* Col 6: Stock Audits (Clean Pill) */}
                          <td style={{ padding: '13px 14px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 750,
                                background: user.canCountStockAudits ? '#eff6ff' : '#f8fafc',
                                color: user.canCountStockAudits ? '#1a62ea' : '#94a3b8',
                                border: `1px solid ${user.canCountStockAudits ? '#bfdbfe' : '#e2e8f0'}`,
                              }}
                            >
                              <span>{user.canCountStockAudits ? '✓ Counter' : '✕ None'}</span>
                            </span>
                          </td>

                          {/* Col 7: Actions */}
                          <td style={{ padding: '13px 20px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                              {/* Edit Permissions Button */}
                              <button
                                type="button"
                                onClick={() => openEditModal(user)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  background: '#eff6ff',
                                  border: '1px solid #bfdbfe',
                                  color: '#1a62ea',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  transition: 'all 0.12s ease',
                                }}
                                title="Configure user permissions"
                              >
                                Edit
                              </button>

                              {/* Quick Copy Button */}
                              <button
                                type="button"
                                onClick={() => copyUserPolicy(user)}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#64748b',
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'grid',
                                  placeItems: 'center',
                                  fontSize: '14px',
                                }}
                                title="Copy policy snapshot"
                              >
                                🔗
                              </button>

                              {/* Context Menu Trigger */}
                              <div className="perm-action-menu-wrap" style={{ position: 'relative' }}>
                                <button
                                  type="button"
                                  onClick={() => setActiveActionMenuId((prev) => (prev === user.id ? null : user.id))}
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#64748b',
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'grid',
                                    placeItems: 'center',
                                    fontSize: '16px',
                                    fontWeight: 800,
                                  }}
                                  title="More options"
                                >
                                  ···
                                </button>

                                {activeActionMenuId === user.id && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      top: 'calc(100% + 4px)',
                                      right: 0,
                                      zIndex: 60,
                                      background: '#ffffff',
                                      borderRadius: '10px',
                                      border: '1px solid #cbd5e1',
                                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                      minWidth: '200px',
                                      padding: '5px',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <div
                                      onClick={() => openEditModal(user)}
                                      style={{ padding: '7px 10px', fontSize: '12px', fontWeight: 650, color: '#1a62ea', cursor: 'pointer', borderRadius: '6px' }}
                                    >
                                      ✎ Configure Permissions...
                                    </div>
                                    <div
                                      onClick={() => void applyQuickPreset(user, true, true, false, 'Full POS Access')}
                                      style={{ padding: '7px 10px', fontSize: '12px', fontWeight: 550, color: '#059669', cursor: 'pointer', borderRadius: '6px' }}
                                    >
                                      ⚡ Grant Voids & Returns
                                    </div>
                                    <div
                                      onClick={() => void applyQuickPreset(user, false, true, false, 'Returns Only')}
                                      style={{ padding: '7px 10px', fontSize: '12px', fontWeight: 550, color: '#334155', cursor: 'pointer', borderRadius: '6px' }}
                                    >
                                      ⚡ Grant Returns Desk Only
                                    </div>
                                    <div
                                      onClick={() => void applyQuickPreset(user, false, false, true, 'Stock Auditor')}
                                      style={{ padding: '7px 10px', fontSize: '12px', fontWeight: 550, color: '#4f46e5', cursor: 'pointer', borderRadius: '6px' }}
                                    >
                                      📦 Grant Stock Audit Count
                                    </div>
                                    <div
                                      onClick={() => void applyQuickPreset(user, false, false, false, 'Standard Sales (Revoked)')}
                                      style={{ padding: '7px 10px', fontSize: '12px', fontWeight: 550, color: '#dc2626', cursor: 'pointer', borderRadius: '6px' }}
                                    >
                                      ⛔ Revoke All Overrides
                                    </div>
                                    <div
                                      onClick={() => {
                                        navigator.clipboard.writeText(user.email);
                                        setNotice(`Copied ${user.email} to clipboard.`);
                                        setActiveActionMenuId(null);
                                      }}
                                      style={{ padding: '7px 10px', fontSize: '12px', fontWeight: 550, color: '#64748b', cursor: 'pointer', borderRadius: '6px', borderTop: '1px solid #f1f5f9' }}
                                    >
                                      📋 Copy Email Address
                                    </div>
                                  </div>
                                )}
                              </div>
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
                background: '#ffffff',
                borderTop: '1px solid #edf2f7',
                fontSize: '12px',
                color: '#64748b',
              }}
            >
              <span>
                Showing <strong>{filteredUsers.length}</strong> of <strong>{users.length}</strong> active staff accounts
              </span>
              <span>
                Dual-Axis Security Invariant OD-08: Permissions are enforced at register dispatch.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* VIEW TAB 2: ROLE STANDARDS */}
      {activeTab === 'TEMPLATES' && (
        <div>
          <div style={{ marginBottom: '18px', fontSize: '12.5px', fontWeight: 850, color: '#334155', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            ORGANIZATIONAL ROLE PERMISSION STANDARDS
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px', marginBottom: '30px' }}>
            {/* Store Managers Standard */}
            <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #eef2f6', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '4px 10px', borderRadius: '20px', border: '1px solid #a7f3d0' }}>
                  MANAGEMENT TIER
                </span>
                <span style={{ fontSize: '18px', fontWeight: 850, color: '#059669' }}>Full Privilege</span>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 8px', color: '#0f172a' }}>Store Managers</h3>
              <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, margin: '0 0 16px' }}>
                Store supervisors have full operational authority to void mistake sales, authorize returns with refund voucher generation, and conduct stock audits.
              </p>
              <div style={{ fontSize: '12.5px', color: '#334155', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontWeight: 550 }}>
                <strong>Authorized:</strong> Sales Cancellation ✓ · Customer Returns ✓ · Stock Audits ✓
              </div>
            </div>

            {/* Cashiers Standard */}
            <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #eef2f6', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#1a62ea', background: '#eff6ff', padding: '4px 10px', borderRadius: '20px', border: '1px solid #bfdbfe' }}>
                  OPERATIONAL TIER
                </span>
                <span style={{ fontSize: '18px', fontWeight: 850, color: '#1a62ea' }}>Role Controlled</span>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 8px', color: '#0f172a' }}>Cashier Terminal Stations</h3>
              <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, margin: '0 0 16px' }}>
                Standard cashiers can execute checkouts. Senior cashiers or returns desk staff can be provisioned with returns handling privileges as needed.
              </p>
              <div style={{ fontSize: '12.5px', color: '#334155', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontWeight: 550 }}>
                <strong>Authorized:</strong> Sales Cancellation (Discretionary) · Customer Returns (Configurable)
              </div>
            </div>

            {/* Warehouse Standard */}
            <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #eef2f6', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#4f46e5', background: '#eef2ff', padding: '4px 10px', borderRadius: '20px', border: '1px solid #c7d2fe' }}>
                  LOGISTICS TIER
                </span>
                <span style={{ fontSize: '18px', fontWeight: 850, color: '#4f46e5' }}>Stock Auditor</span>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 8px', color: '#0f172a' }}>Warehouse Logistics</h3>
              <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, margin: '0 0 16px' }}>
                Warehouse and depot managers hold physical inventory counting authority. They cannot execute POS sales cancellations or register refunds.
              </p>
              <div style={{ fontSize: '12.5px', color: '#334155', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontWeight: 550 }}>
                <strong>Authorized:</strong> Stock Audit Count ✓ · Sales POS (Restricted ✕)
              </div>
            </div>
          </div>

          {/* Deep Invariant Architecture Callout */}
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #eef2f6',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '22px' }}>🛡️</span>
              <h2 style={{ fontSize: '18px', fontWeight: 850, margin: 0, color: '#0f172a' }}>
                OD-08 Security Invariant Architecture
              </h2>
            </div>
            <div style={{ fontSize: '13.5px', color: '#334155', lineHeight: 1.6, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '14px' }}>
              <div>
                <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px', fontSize: '14px' }}>1. Scoped POS Enforcement</strong>
                Permissions are validated cryptographically against JWT tokens and store location scopes upon invoice cancellation or return initiation.
              </div>
              <div>
                <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px', fontSize: '14px' }}>2. Mandatory Cancellation Reason</strong>
                Every invoice void requires selecting a business cancellation code and entering an audit justification note recorded in the immutable ledger.
              </div>
              <div>
                <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px', fontSize: '14px' }}>3. Segregation of Stock Auditing</strong>
                Stock audit count permissions remain strictly decoupled from cashier sales checkout, preventing unmonitored inventory adjustments.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT USER PERMISSIONS (Matching modal style of /admin/users, /admin/company, /admin/discount-limits) */}
      {editingUser && (
        <div
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
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              width: 'min(520px, 100%)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
              padding: '26px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 850, margin: 0, color: '#0f172a' }}>
                  Configure Staff Sales Permissions
                </h2>
                <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>
                  {editingUser.name || editingUser.email} · {roleLabels[editingUser.role] || editingUser.role}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                style={{ border: 'none', background: '#f1f5f9', borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', fontSize: '14px', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModal} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Permission Toggles List */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Toggle 1: Cancel Sales */}
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div>
                    <strong style={{ fontSize: '13px', color: '#1e293b', display: 'block' }}>Void & Cancel Finalized Sales Invoices</strong>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>Permits cancelling receipts on POS terminals (Requires justification)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={modalCanCancel}
                    onChange={(e) => setModalCanCancel(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#1a62ea', cursor: 'pointer' }}
                  />
                </label>

                <div style={{ height: '1px', background: '#eef2f6' }} />

                {/* Toggle 2: Process Returns */}
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div>
                    <strong style={{ fontSize: '13px', color: '#1e293b', display: 'block' }}>Process Customer Returns & Refunds</strong>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>Permits accepting returned items and issuing credit vouchers</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={modalCanReturn}
                    onChange={(e) => setModalCanReturn(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#1a62ea', cursor: 'pointer' }}
                  />
                </label>

                <div style={{ height: '1px', background: '#eef2f6' }} />

                {/* Toggle 3: Stock Audits */}
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <div>
                    <strong style={{ fontSize: '13px', color: '#1e293b', display: 'block' }}>Conduct Physical Stock Count Audits</strong>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>Permits counting inventory on /audits during stock reconciliation</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={modalCanAudit}
                    onChange={(e) => setModalCanAudit(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#1a62ea', cursor: 'pointer' }}
                  />
                </label>
              </div>

              {/* Justification Reason Field */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 750, color: '#334155', marginBottom: '6px' }}>
                  Audit Justification Reason (Required by Invariant OD-08)
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
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    color: '#0f172a',
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
                  style={{ padding: '9px 16px', borderRadius: '8px', background: '#f1f5f9', border: 'none', color: '#475569', fontSize: '13px', fontWeight: 650, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUserId === editingUser.id}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    background: '#1a62ea',
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
              background: '#ffffff',
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
                <span style={{ fontSize: '22px' }}>▤</span>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 850, margin: 0, color: '#0f172a' }}>
                    Sales Permission Audit Trail (OD-08)
                  </h2>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Immutable historical ledger of sales void and return authorizations
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                style={{ border: 'none', background: '#f1f5f9', borderRadius: '8px', width: '30px', height: '30px', cursor: 'pointer', fontSize: '15px', fontWeight: 800, color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: '1px solid #e2e8f0', marginBottom: '16px', fontSize: '12.5px', color: '#334155', lineHeight: 1.5 }}>
              Each time an administrator updates sales permissions, the system immutably logs the <strong>target account</strong>, <strong>administrator account ID</strong>, <strong>timestamp</strong>, and <strong>mandatory business reason</strong>.
            </div>

            {/* Audit Log Entries Table */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 150px 110px 1fr', padding: '9px 12px', background: '#f1f5f9', fontSize: '10.5px', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>
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
                    borderTop: '1px solid #f1f5f9',
                    fontSize: '12px',
                    color: '#1e293b',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ color: '#64748b', fontSize: '11.5px' }}>{entry.time}</div>
                  <div style={{ fontWeight: 700 }}>{entry.target.split('@')[0]}</div>
                  <div>
                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#eff6ff', color: '#1a62ea', fontWeight: 750, fontSize: '11px' }}>
                      {entry.delta}
                    </span>
                  </div>
                  <div style={{ color: '#475569', fontSize: '11.5px' }}>{entry.reason}</div>
                </div>
              ))}
              <p style={{ margin: 0, padding: 18, color: '#64748b', fontSize: 13 }}>No permission changes have been recorded yet.</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: '#1a62ea',
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

      {/* MODAL: BULK PRESET POLICY */}
      {isBulkModalOpen && (
        <div
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
            if (e.target === e.currentTarget) setIsBulkModalOpen(false);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              width: 'min(480px, 100%)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
              padding: '26px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 850, margin: 0, color: '#0f172a' }}>
                Bulk Permissions Preset
              </h2>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                style={{ border: 'none', background: '#f1f5f9', borderRadius: '8px', width: '28px', height: '28px', cursor: 'pointer', fontSize: '14px', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleApplyBulk} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 750, color: '#334155', marginBottom: '5px' }}>
                  Target Role
                </label>
                <select
                  value={bulkRole}
                  onChange={(e) => setBulkRole(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}
                >
                  <option value="CASHIER">All Cashier Stations</option>
                  <option value="STORE_MANAGER">All Store Managers</option>
                  <option value="STAFF">All Floor Staff</option>
                </select>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#1e293b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={bulkCanCancel}
                    onChange={(e) => setBulkCanCancel(e.target.checked)}
                    style={{ accentColor: '#1a62ea' }}
                  />
                  <span>Allow Voiding / Cancelling Sales</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#1e293b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={bulkCanReturn}
                    onChange={(e) => setBulkCanReturn(e.target.checked)}
                    style={{ accentColor: '#1a62ea' }}
                  />
                  <span>Allow Processing Customer Returns</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#1e293b', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={bulkCanAudit}
                    onChange={(e) => setBulkCanAudit(e.target.checked)}
                    style={{ accentColor: '#1a62ea' }}
                  />
                  <span>Allow Conducting Stock Audits</span>
                </label>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 750, color: '#334155', marginBottom: '5px' }}>
                  Audit Justification Reason
                </label>
                <input
                  type="text"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder="Reason for role-wide update..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', fontWeight: 550, color: '#0f172a' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  style={{ padding: '8px 14px', borderRadius: '8px', background: '#f1f5f9', border: 'none', color: '#475569', fontSize: '12.5px', fontWeight: 650, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 18px', borderRadius: '8px', background: '#1a62ea', border: 'none', color: '#ffffff', fontSize: '12.5px', fontWeight: 750, cursor: 'pointer', boxShadow: '0 2px 6px rgba(26, 98, 234, 0.28)' }}
                >
                  Apply to All {roleLabels[bulkRole]}s
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
