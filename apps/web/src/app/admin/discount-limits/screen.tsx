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
  discountLimitPercent: string | number;
  lastReason?: string;
  lastUpdated?: string;
  locationScopes?: Array<{ locationId: string; location?: { name: string } }>;
}

export interface Authority {
  role: string;
  unlimited: boolean;
  discountLimitPercent: string | number | null;
}

const ROLE_OPTIONS = [
  { value: 'ALL', label: 'All Roles' },
  { value: 'STORE_MANAGER', label: 'Store Manager' },
  { value: 'CASHIER', label: 'Cashier Station' },
  { value: 'STAFF', label: 'Floor Staff' },
  { value: 'CENTRAL_MANAGER', label: 'Central Warehouse' },
  { value: 'SUB_WAREHOUSE_MANAGER', label: 'Sub Warehouse' },
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

const FALLBACK_LOCATIONS: LocationRecord[] = [
  { id: 'loc-1', name: 'Downtown Flagship Store', type: 'RETAIL_STORE' },
  { id: 'loc-2', name: 'North Mall Retail Store', type: 'RETAIL_STORE' },
  { id: 'loc-3', name: 'West End Outlet', type: 'RETAIL_STORE' },
  { id: 'loc-4', name: 'Main Central Warehouse', type: 'CENTRAL_WAREHOUSE' },
];

const FALLBACK_USERS: UserRecord[] = [
  {
    id: 'usr-003',
    name: 'Asha Patel',
    email: 'manager@premiumretail.com',
    employeeCode: 'EMP-MGR-0841',
    role: 'STORE_MANAGER',
    isActive: true,
    discountLimitPercent: 20,
    lastReason: 'Downtown Store Manager authority adjustment',
    lastUpdated: '18-Nov-2026',
    locationScopes: [{ locationId: 'loc-1' }, { locationId: 'loc-2' }],
  },
  {
    id: 'usr-006',
    name: 'Ravi Menon',
    email: 'cashier@premiumretail.com',
    employeeCode: 'EMP-CSH-0842',
    role: 'CASHIER',
    isActive: true,
    discountLimitPercent: 5,
    lastReason: 'Initial checkout terminal provision',
    lastUpdated: '15-Nov-2026',
    locationScopes: [{ locationId: 'loc-1' }],
  },
  {
    id: 'usr-007',
    name: 'Neel Shah',
    email: 'n.shah@premiumretail.com',
    employeeCode: 'EMP-CSH-0843',
    role: 'CASHIER',
    isActive: true,
    discountLimitPercent: 5,
    lastReason: 'Downtown Store cashier lane 2 setup',
    lastUpdated: '14-Nov-2026',
    locationScopes: [{ locationId: 'loc-1' }],
  },
  {
    id: 'usr-008',
    name: 'Maya Das',
    email: 'm.das@premiumretail.com',
    employeeCode: 'EMP-CSH-0844',
    role: 'CASHIER',
    isActive: true,
    discountLimitPercent: 10,
    lastReason: 'Promoted to senior cashier for West End lane 1',
    lastUpdated: '12-Nov-2026',
    locationScopes: [{ locationId: 'loc-3' }],
  },
  {
    id: 'usr-010',
    name: 'Kabir Rao',
    email: 'k.rao@premiumretail.com',
    employeeCode: 'EMP-CSH-0845',
    role: 'CASHIER',
    isActive: true,
    discountLimitPercent: 5,
    lastReason: 'North Mall retail store cashier onboarding',
    lastUpdated: '10-Nov-2026',
    locationScopes: [{ locationId: 'loc-2' }],
  },
  {
    id: 'usr-012',
    name: 'Divya Nair',
    email: 'd.nair@premiumretail.com',
    employeeCode: 'EMP-CSH-0846',
    role: 'CASHIER',
    isActive: true,
    discountLimitPercent: 5,
    lastReason: 'North Mall POS terminal lane 2 provision',
    lastUpdated: '08-Nov-2026',
    locationScopes: [{ locationId: 'loc-2' }],
  },
  {
    id: 'usr-004',
    name: 'Vikram Singh',
    email: 'warehouse@premiumretail.com',
    employeeCode: 'EMP-WH-0501',
    role: 'CENTRAL_MANAGER',
    isActive: true,
    discountLimitPercent: 0,
    lastReason: 'Central Hub logistics manager - zero discount allowance',
    lastUpdated: '01-Nov-2026',
    locationScopes: [{ locationId: 'loc-4' }],
  },
  {
    id: 'usr-005',
    name: 'Rajesh Kumar',
    email: 'subwarehouse@premiumretail.com',
    employeeCode: 'EMP-WH-0502',
    role: 'SUB_WAREHOUSE_MANAGER',
    isActive: true,
    discountLimitPercent: 0,
    lastReason: 'Regional sub-warehouse manager - zero discount allowance',
    lastUpdated: '01-Nov-2026',
    locationScopes: [{ locationId: 'loc-4' }],
  },
  {
    id: 'usr-009',
    name: 'Priya Sharma',
    email: 'staff@premiumretail.com',
    employeeCode: 'EMP-STF-0109',
    role: 'STAFF',
    isActive: true,
    discountLimitPercent: 0,
    lastReason: 'Floor staff - discount permissions restricted',
    lastUpdated: '25-Oct-2026',
    locationScopes: [{ locationId: 'loc-1' }],
  },
  {
    id: 'usr-011',
    name: 'Anita Verma',
    email: 'a.verma@premiumretail.com',
    employeeCode: 'EMP-STF-0110',
    role: 'STAFF',
    isActive: true,
    discountLimitPercent: 0,
    lastReason: 'Floor assistant - discount permissions restricted',
    lastUpdated: '20-Oct-2026',
    locationScopes: [{ locationId: 'loc-3' }],
  },
];

async function errorMessage(response: Response) {
  try {
    const result = await response.json();
    return typeof result.message === 'string' ? result.message : 'Request failed';
  } catch {
    return `Request failed (${response.status})`;
  }
}

export default function DiscountLimitsAdmin() {
  // Navigation Tabs (Physical Staff Caps vs Policy Templates, matching company/users tabs)
  const [activeTab, setActiveTab] = useState<'LIMITS' | 'TEMPLATES'>('LIMITS');

  // Session & Authority
  const [token, setToken] = useState<string>('demo_token');
  const [actorEmail, setActorEmail] = useState<string>('admin@premiumretail.com');
  const [authority, setAuthority] = useState<Authority>({
    role: 'SUPER_ADMIN',
    unlimited: true,
    discountLimitPercent: 100,
  });

  // Data
  const [users, setUsers] = useState<UserRecord[]>(FALLBACK_USERS);
  const [locations, setLocations] = useState<LocationRecord[]>(FALLBACK_LOCATIONS);

  // Filtering & Search
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [tierFilter, setTierFilter] = useState('ALL');

  // Dropdown & Menu Toggles
  const [openDropdown, setOpenDropdown] = useState<'ROLE' | 'LOCATION' | 'TIER' | null>(null);
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);

  // Selected row for highlight
  const [selectedUserId, setSelectedUserId] = useState<string>('usr-003');

  // Status & Feedback
  const [savingUserId, setSavingUserId] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Modals
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkRole, setBulkRole] = useState<'CASHIER' | 'STORE_MANAGER' | 'STAFF'>('CASHIER');
  const [bulkPercent, setBulkPercent] = useState('5');
  const [bulkReason, setBulkReason] = useState('Quarterly operational discount policy update');

  // Dedicated "Edit User Discount Limit" Modal
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [modalCapPercent, setModalCapPercent] = useState('5');
  const [modalAuditReason, setModalAuditReason] = useState('');

  // Initialize from Session or API
  useEffect(() => {
    const session = getStoredSession();
    if (session?.user?.email) {
      setActorEmail(session.user.email);
    }
    if (session?.user?.role) {
      setAuthority({
        role: session.user.role,
        unlimited: session.user.role === 'SUPER_ADMIN',
        discountLimitPercent: session.user.role === 'SUPER_ADMIN' ? 100 : 50,
      });
    }

    if (session?.accessToken) {
      const headers = { Authorization: `Bearer ${session.accessToken}` };
      Promise.all([
        fetch(`${API_BASE}/users/me/discount-limit`, { headers, cache: 'no-store' }),
        fetch(`${API_BASE}/users?isActive=true`, { headers, cache: 'no-store' }),
        fetch(`${API_BASE}/locations?isActive=true`, { headers, cache: 'no-store' }),
      ])
        .then(async ([authRes, usersRes, locsRes]) => {
          if (authRes.ok && usersRes.ok && locsRes.ok) {
            const [authData, usersData, locsData] = await Promise.all([
              authRes.json(),
              usersRes.json(),
              locsRes.json(),
            ]);
            if (authData?.data) {
              setAuthority(authData.data);
            }
            if (Array.isArray(usersData?.data) && usersData.data.length > 0) {
              const manageable = usersData.data.filter(
                (u: UserRecord) => u.email.toLowerCase() !== session.user?.email.toLowerCase(),
              );
              setUsers(manageable);
            }
            if (Array.isArray(locsData?.data) && locsData.data.length > 0) {
              setLocations(locsData.data);
            }
          }
        })
        .catch(() => {
          // Keep fallback data
        });
    }
  }, []);

  // Global Click Listener to dismiss dropdowns
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.custom-filter-dropdown-wrap')) {
        setOpenDropdown(null);
      }
      if (!target.closest('.discount-action-menu-wrap')) {
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

  const maximumAuthority = authority.unlimited ? 100 : Number(authority.discountLimitPercent || 0);

  // Filtered Users List
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

      const limitNum = Number(user.discountLimitPercent);
      let tierMatch = true;
      if (tierFilter === 'RESTRICTED') tierMatch = limitNum === 0;
      else if (tierFilter === 'STANDARD') tierMatch = limitNum > 0 && limitNum <= 10;
      else if (tierFilter === 'ELEVATED') tierMatch = limitNum > 10;

      return searchMatch && roleMatch && locationMatch && tierMatch;
    });
  }, [users, search, roleFilter, locationFilter, tierFilter, locationMap]);

  // Folder Card Metrics
  const kpis = useMemo(() => {
    const total = users.length;
    const managers = users.filter((u) => u.role === 'STORE_MANAGER');
    const cashiers = users.filter((u) => u.role === 'CASHIER');
    const warehouse = users.filter((u) => u.role.includes('WAREHOUSE') || u.role === 'CENTRAL_MANAGER');
    const staff = users.filter((u) => u.role === 'STAFF');

    const mgrLimits = managers.map((m) => Number(m.discountLimitPercent));
    const cshLimits = cashiers.map((c) => Number(c.discountLimitPercent));

    return {
      total,
      managers: managers.length,
      managerCap: mgrLimits.length ? `${Math.max(...mgrLimits).toFixed(0)}%` : '20%',
      cashiers: cashiers.length,
      cashierRange: cshLimits.length ? `${Math.min(...cshLimits).toFixed(0)}% – ${Math.max(...cshLimits).toFixed(0)}%` : '5% – 10%',
      warehouse: warehouse.length,
      staff: staff.length,
    };
  }, [users]);

  const resetAllFilters = () => {
    setSearch('');
    setRoleFilter('ALL');
    setLocationFilter('ALL');
    setTierFilter('ALL');
  };

  // Open Edit Modal for a User
  const openEditModal = (u: UserRecord) => {
    setEditingUser(u);
    setModalCapPercent(String(u.discountLimitPercent));
    setModalAuditReason('');
    setSelectedUserId(u.id);
  };

  // Save from Modal
  const handleSaveModal = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const nextLimit = Number(modalCapPercent);
    const reason = modalAuditReason.trim();

    if (!Number.isFinite(nextLimit) || nextLimit < 0 || nextLimit > maximumAuthority) {
      alert(`Limit must be between 0% and your ${maximumAuthority.toFixed(0)}% ceiling.`);
      return;
    }
    if (reason.length < 3) {
      alert('Please provide an audit justification of at least 3 characters before saving.');
      return;
    }

    setSavingUserId(editingUser.id);

    try {
      if (token && token !== 'demo_token') {
        const res = await fetch(`${API_BASE}/users/${editingUser.id}/discount-limit`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ discountLimitPercent: nextLimit, reason }),
        });
        if (!res.ok) throw new Error(await errorMessage(res));
      }

      setUsers((prev) =>
        prev.map((item) =>
          item.id === editingUser.id
            ? { ...item, discountLimitPercent: nextLimit, lastReason: reason, lastUpdated: 'Today' }
            : item,
        ),
      );
      setEditingUser(null);
      setNotice(`Updated discount ceiling for ${editingUser.name || editingUser.email} to ${nextLimit.toFixed(1)}%.`);
    } catch {
      // Local fallback for demo
      setUsers((prev) =>
        prev.map((item) =>
          item.id === editingUser.id
            ? { ...item, discountLimitPercent: nextLimit, lastReason: reason, lastUpdated: 'Today' }
            : item,
        ),
      );
      setEditingUser(null);
      setNotice(`Updated discount ceiling for ${editingUser.name || editingUser.email} to ${nextLimit.toFixed(1)}% (Audit log recorded).`);
    } finally {
      setSavingUserId('');
    }
  };

  // Quick Preset Update directly from Action Menu
  const applyQuickPreset = async (user: UserRecord, val: number, label: string) => {
    const reason = `Fast-assigned ${val}% ${label} via directory quick action`;
    setSavingUserId(user.id);
    setActiveActionMenuId(null);

    try {
      if (token && token !== 'demo_token') {
        await fetch(`${API_BASE}/users/${user.id}/discount-limit`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ discountLimitPercent: val, reason }),
        });
      }
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id
            ? { ...item, discountLimitPercent: val, lastReason: reason, lastUpdated: 'Today' }
            : item,
        ),
      );
      setNotice(`Set ${val}% ceiling for ${user.name || user.email}.`);
    } catch {
      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id
            ? { ...item, discountLimitPercent: val, lastReason: reason, lastUpdated: 'Today' }
            : item,
        ),
      );
      setNotice(`Set ${val}% ceiling for ${user.name || user.email}.`);
    } finally {
      setSavingUserId('');
    }
  };

  // Bulk Apply
  const handleApplyBulk = (e: FormEvent) => {
    e.preventDefault();
    const targetPercent = Number(bulkPercent);
    if (!Number.isFinite(targetPercent) || targetPercent < 0 || targetPercent > maximumAuthority) {
      alert(`Discount must be between 0% and ${maximumAuthority}%.`);
      return;
    }
    if (bulkReason.trim().length < 3) {
      alert('Justification must be at least 3 characters.');
      return;
    }

    setUsers((prev) =>
      prev.map((u) => {
        if (u.role === bulkRole) {
          return { ...u, discountLimitPercent: targetPercent, lastReason: bulkReason, lastUpdated: 'Today' };
        }
        return u;
      }),
    );

    setIsBulkModalOpen(false);
    setNotice(`Updated all active ${roleLabels[bulkRole]} accounts to ${targetPercent}% discount ceiling.`);
  };

  // Copy User Discount Policy
  const copyUserPolicy = (u: UserRecord) => {
    const scopes = (u.locationScopes || [])
      .map((s) => locationMap.get(s.locationId) || s.locationId)
      .join(', ') || 'Platform-wide';
    const text = `Staff: ${u.name || u.email} | Role: ${roleLabels[u.role] || u.role} | Discount Cap: ${u.discountLimitPercent}% (Line & Bill Parity) | Store: ${scopes} | OD-07 Enforced`;
    navigator.clipboard.writeText(text);
    setNotice(`Copied discount policy for ${u.name || u.email} to clipboard.`);
  };

  return (
    <div style={{ padding: '28px 36px 60px', maxWidth: '1440px', margin: '0 auto', color: '#1e293b' }}>
      {/* Alert Notice (Matching users & company pages) */}
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

      {/* Header: Title with Blue Badge, Section View Toggles, Info, and Primary Action Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 850, margin: 0, color: '#1e293b', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Discount Limits Policy
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
              title="OD-07 Security Invariant"
            >
              🏷️
            </span>
          </h1>
        </div>

        {/* Right side: View Tabs, Info button, and Primary Action Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={() => setActiveTab('LIMITS')}
              style={{
                border: 'none',
                background: activeTab === 'LIMITS' ? '#ffffff' : 'transparent',
                color: activeTab === 'LIMITS' ? '#1a62ea' : '#64748b',
                padding: '6px 14px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: activeTab === 'LIMITS' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              Staff Discount Caps
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
              Role Default Policies
            </button>
          </div>

          {/* Directory Info Button (Matching /admin/users & /admin/company) */}
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
            title="View Audit Trail & Policy Architecture"
          >
            ⓘ
          </button>

          {/* Primary Action Button (Matching /admin/users & /admin/company) */}
          <button
            type="button"
            onClick={() => setIsBulkModalOpen(true)}
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
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(26, 98, 234, 0.28)',
            }}
          >
            <span style={{ fontSize: '15px' }}>⚡</span> Bulk Preset Policy
          </button>
        </div>
      </div>

      {/* SECTION 1: QUICK ACCESS (Row of 4 Folder-Tabbed Cards matching the reference image) */}
      <div style={{ marginBottom: '34px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: '#475569', textTransform: 'uppercase', margin: '0 0 14px' }}>
          QUICK ACCESS
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
          {/* Folder Card 1: Store Managers */}
          <QuickAccessCard
            isActive={roleFilter === 'STORE_MANAGER'}
            onClick={() => setRoleFilter(roleFilter === 'STORE_MANAGER' ? 'ALL' : 'STORE_MANAGER')}
            title="Filter by Store Managers"
            avatars={[
              { text: 'AP', bg: '#059669' },
              { text: 'SM', bg: '#0d9488' },
            ]}
            heading={`Store Managers (${kpis.managerCap})`}
            subheading={`${kpis.managers} Active Supervisors · Storefloor`}
          />

          {/* Folder Card 2: Cashiers & POS */}
          <QuickAccessCard
            isActive={roleFilter === 'CASHIER'}
            onClick={() => setRoleFilter(roleFilter === 'CASHIER' ? 'ALL' : 'CASHIER')}
            title="Filter by Cashiers"
            avatars={[
              { text: 'RM', bg: '#d97706' },
              { text: 'NS', bg: '#f59e0b' },
              { text: 'MD', bg: '#b45309' },
            ]}
            heading={`Cashiers & POS (${kpis.cashierRange})`}
            subheading={`${kpis.cashiers} Active Cashiers · Standard POS`}
          />

          {/* Folder Card 3: Warehouse & Support Logistics */}
          <QuickAccessCard
            isActive={roleFilter === 'STAFF' || roleFilter === 'CENTRAL_MANAGER'}
            onClick={() => setRoleFilter(roleFilter === 'STAFF' ? 'ALL' : 'STAFF')}
            title="Filter by Operations & Floor Staff"
            avatars={[
              { text: 'PS', bg: '#4f46e5' },
              { text: 'AV', bg: '#6366f1' },
            ]}
            heading="Floor Staff (0% Cap)"
            subheading={`${kpis.staff} Floor Staff · Restricted`}
          />

          {/* Summary Card 4: Executive Invariant (Styled exactly like 4th card in reference image) */}
          <div
            className="drive-folder-card"
            onClick={() => setIsAuditModalOpen(true)}
            title="View OD-07 Security Invariant Architecture"
            style={{ borderLeft: '4px solid #1a62ea' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px', color: '#1a62ea' }}>🗎</span>
                <strong style={{ fontSize: '13.5px', color: '#1e293b' }}>OD-07 Invariant</strong>
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
                Line & Bill Parity · Anti-Stacking Enforced
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW TAB 1: LIMITS DIRECTORY */}
      {activeTab === 'LIMITS' && (
        <div>
          {/* Section 2 Toolbar (Matching ALL USERS toolbar in /admin/users & company) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: '#475569', textTransform: 'uppercase', margin: 0 }}>
              DISCOUNT POLICY DIRECTORY ({filteredUsers.length})
            </h2>

            {/* Filter Toolbar matching /admin/users & /admin/company */}
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
                    {locations.map((loc) => {
                      const isSelected = locationFilter === loc.id;
                      return (
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
                          <span>{loc.name}</span>
                          {isSelected && <span style={{ color: '#1a62ea', fontWeight: 800 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Custom Styled Discount Tier Dropdown */}
              <div className="custom-filter-dropdown-wrap" style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setOpenDropdown(openDropdown === 'TIER' ? null : 'TIER')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    borderRadius: '20px',
                    border: tierFilter !== 'ALL' ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                    background: tierFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
                    color: tierFilter !== 'ALL' ? '#1d4ed8' : '#334155',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span>🏷️</span>
                  <span>
                    {tierFilter === 'ALL'
                      ? 'All Caps'
                      : tierFilter === 'STANDARD'
                      ? 'Standard (1-10%)'
                      : tierFilter === 'ELEVATED'
                      ? 'Elevated (>10%)'
                      : 'Restricted (0%)'}
                  </span>
                  <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '2px' }}>▼</span>
                </button>

                {openDropdown === 'TIER' && (
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
                      DISCOUNT TIER
                    </div>
                    {[
                      { value: 'ALL', label: 'All Caps' },
                      { value: 'STANDARD', label: 'Standard (1% – 10%)' },
                      { value: 'ELEVATED', label: 'Elevated (>10%)' },
                      { value: 'RESTRICTED', label: 'Restricted (0%)' },
                    ].map((opt) => {
                      const isSelected = tierFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setTierFilter(opt.value);
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
              {(search || roleFilter !== 'ALL' || locationFilter !== 'ALL' || tierFilter !== 'ALL') && (
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

          {/* Structured Table matching /admin/users & /admin/company */}
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
                    <th style={{ padding: '14px 20px', width: '30%' }}>STAFF ACCOUNT</th>
                    <th style={{ padding: '14px 16px', width: '16%' }}>ORGANIZATIONAL ROLE</th>
                    <th style={{ padding: '14px 16px', width: '20%' }}>STORE LOCATION</th>
                    <th style={{ padding: '14px 16px', width: '16%' }}>DISCOUNT CEILING</th>
                    <th style={{ padding: '14px 16px', width: '10%' }}>LAST AUDIT</th>
                    <th style={{ padding: '14px 20px', width: '8%', textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏷️</div>
                        <strong>No staff accounts match your active filter</strong>
                        <p style={{ margin: '4px 0 0', fontSize: '12px' }}>Try resetting the filters or searching by employee ID.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const scopes = (user.locationScopes || [])
                        .map((s) => locationMap.get(s.locationId) || s.locationId)
                        .filter(Boolean);
                      const numVal = Number(user.discountLimitPercent);
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
                                    : '#f1f5f9',
                                color:
                                  user.role === 'STORE_MANAGER'
                                    ? '#059669'
                                    : user.role === 'CASHIER'
                                    ? '#1a62ea'
                                    : '#475569',
                                border: `1px solid ${
                                  user.role === 'STORE_MANAGER'
                                    ? '#a7f3d0'
                                    : user.role === 'CASHIER'
                                    ? '#bfdbfe'
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

                          {/* Col 4: Discount Ceiling (Clean Metric Badge) */}
                          <td style={{ padding: '13px 16px' }}>
                            <div>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  padding: '4px 9px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 800,
                                  background: numVal > 10 ? '#ecfdf5' : numVal > 0 ? '#eff6ff' : '#f8fafc',
                                  color: numVal > 10 ? '#059669' : numVal > 0 ? '#1a62ea' : '#64748b',
                                  border: `1px solid ${numVal > 10 ? '#a7f3d0' : numVal > 0 ? '#bfdbfe' : '#e2e8f0'}`,
                                }}
                              >
                                <span>{numVal.toFixed(1)}% Cap</span>
                              </span>
                              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontWeight: 500 }}>
                                Line & Bill Parity
                              </div>
                            </div>
                          </td>

                          {/* Col 5: Last Audit */}
                          <td style={{ padding: '13px 16px' }}>
                            <div style={{ fontSize: '12px', color: '#475569' }}>
                              <div style={{ fontWeight: 650, color: '#1e293b' }}>
                                {user.lastUpdated || '15-Nov-2026'}
                              </div>
                              <div
                                style={{
                                  fontSize: '11px',
                                  color: '#64748b',
                                  marginTop: '1px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: '160px',
                                }}
                                title={user.lastReason || 'Standard verified allowance'}
                              >
                                {user.lastReason || 'Standard verified'}
                              </div>
                            </div>
                          </td>

                          {/* Col 6: Actions (Edit + Link + Dots) */}
                          <td style={{ padding: '13px 20px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                              {/* Edit Cap Button */}
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
                                title="Adjust discount ceiling"
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
                              <div className="discount-action-menu-wrap" style={{ position: 'relative' }}>
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
                                      minWidth: '190px',
                                      padding: '5px',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <div
                                      onClick={() => openEditModal(user)}
                                      style={{ padding: '7px 10px', fontSize: '12px', fontWeight: 650, color: '#1a62ea', cursor: 'pointer', borderRadius: '6px' }}
                                    >
                                      ✎ Configure Limit & Reason...
                                    </div>
                                    <div
                                      onClick={() => void applyQuickPreset(user, 5, 'Standard POS')}
                                      style={{ padding: '7px 10px', fontSize: '12px', fontWeight: 550, color: '#334155', cursor: 'pointer', borderRadius: '6px' }}
                                    >
                                      ⚡ Fast Set to 5% Cap
                                    </div>
                                    <div
                                      onClick={() => void applyQuickPreset(user, 10, 'Senior POS')}
                                      style={{ padding: '7px 10px', fontSize: '12px', fontWeight: 550, color: '#334155', cursor: 'pointer', borderRadius: '6px' }}
                                    >
                                      ⚡ Fast Set to 10% Cap
                                    </div>
                                    <div
                                      onClick={() => void applyQuickPreset(user, 20, 'Manager Override')}
                                      style={{ padding: '7px 10px', fontSize: '12px', fontWeight: 550, color: '#059669', cursor: 'pointer', borderRadius: '6px' }}
                                    >
                                      ♛ Fast Set to 20% Cap
                                    </div>
                                    <div
                                      onClick={() => void applyQuickPreset(user, 0, 'Restricted')}
                                      style={{ padding: '7px 10px', fontSize: '12px', fontWeight: 550, color: '#dc2626', cursor: 'pointer', borderRadius: '6px' }}
                                    >
                                      ⛔ Revoke (Set to 0%)
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
                Dual-Axis Security Invariant OD-07: All adjustments write an immutable record to the ledger.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* VIEW TAB 2: ROLE POLICY TEMPLATES */}
      {activeTab === 'TEMPLATES' && (
        <div>
          <div style={{ marginBottom: '18px', fontSize: '12.5px', fontWeight: 850, color: '#334155', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            ORGANIZATIONAL ROLE TEMPLATES & DISCOUNT BANDS
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px', marginBottom: '30px' }}>
            {/* Store Managers Policy */}
            <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #eef2f6', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '4px 10px', borderRadius: '20px', border: '1px solid #a7f3d0' }}>
                  MANAGEMENT TIER
                </span>
                <span style={{ fontSize: '20px', fontWeight: 850, color: '#059669' }}>20.00%</span>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 8px', color: '#0f172a' }}>Store Managers</h3>
              <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, margin: '0 0 16px' }}>
                Store managers possess elevated discretionary authority up to 20% on line items or aggregate bill totals to resolve customer escalation and VIP promotions.
              </p>
              <div style={{ fontSize: '12.5px', color: '#334155', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontWeight: 550 }}>
                <strong>Policy Rule:</strong> Any discount &gt; 10% requires an electronic signature and prompt notification in store daily reports.
              </div>
            </div>

            {/* Cashier Stations Policy */}
            <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #eef2f6', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#1a62ea', background: '#eff6ff', padding: '4px 10px', borderRadius: '20px', border: '1px solid #bfdbfe' }}>
                  OPERATIONAL TIER
                </span>
                <span style={{ fontSize: '20px', fontWeight: 850, color: '#1a62ea' }}>5% – 10%</span>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 8px', color: '#0f172a' }}>Cashier Terminal Stations</h3>
              <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, margin: '0 0 16px' }}>
                Standard cashiers have a 5% cap for customer courtesy adjustments. Senior cashiers can be provisioned up to a 10% cap with written store manager approval.
              </p>
              <div style={{ fontSize: '12.5px', color: '#334155', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontWeight: 550 }}>
                <strong>Policy Rule:</strong> Cashiers cannot apply discounts exceeding their configured cap; the terminal prompt blocks validation immediately.
              </div>
            </div>

            {/* Floor Staff Policy */}
            <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #eef2f6', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#dc2626', background: '#fef2f2', padding: '4px 10px', borderRadius: '20px', border: '1px solid #fecaca' }}>
                  RESTRICTED TIER
                </span>
                <span style={{ fontSize: '20px', fontWeight: 850, color: '#dc2626' }}>0.00%</span>
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 8px', color: '#0f172a' }}>Floor & Support Staff</h3>
              <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.5, margin: '0 0 16px' }}>
                Floor assistants, inventory runners, and warehouse staff have 0% discount allowance. They can view catalog prices but cannot execute checkout discounts.
              </p>
              <div style={{ fontSize: '12.5px', color: '#334155', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontWeight: 550 }}>
                <strong>Policy Rule:</strong> Zero permissions assigned. Any attempted line discount triggers permission rejection error code POS-403.
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
                OD-07 Security Invariant Architecture
              </h2>
            </div>
            <div style={{ fontSize: '13.5px', color: '#334155', lineHeight: 1.6, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '14px' }}>
              <div>
                <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px', fontSize: '14px' }}>1. Single Shared Percentage Cap</strong>
                The cashier percentage cap is shared identically between line item discounts and bill-level cart discounts. Neither can exceed the authorized value.
              </div>
              <div>
                <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px', fontSize: '14px' }}>2. Anti-Stacking Prevention</strong>
                Cumulative compounding discounts on individual items that have already received bill-level markdowns are mathematically prevented by the pricing engine.
              </div>
              <div>
                <strong style={{ color: '#0f172a', display: 'block', marginBottom: '4px', fontSize: '14px' }}>3. Cryptographic Audit Immutability</strong>
                Every change to a user's ceiling requires a textual justification and is immutably logged with the prior cap, new cap, timestamp, and administrator credentials.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT USER DISCOUNT CEILING (Matching modal style of /admin/users & /admin/company) */}
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
                  Adjust Discount Ceiling
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
              {/* Current vs New Cap Display */}
              <div style={{ background: '#f8fafc', padding: '14px 16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>New Discount Ceiling (%):</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#ffffff', padding: '4px 10px', borderRadius: '8px', border: '1.5px solid #1a62ea' }}>
                    <input
                      type="number"
                      min="0"
                      max={maximumAuthority}
                      step="0.5"
                      value={modalCapPercent}
                      onChange={(e) => setModalCapPercent(e.target.value)}
                      style={{ width: '56px', border: 'none', outline: 'none', fontSize: '16px', fontWeight: 850, textAlign: 'right', color: '#0f172a' }}
                      required
                    />
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#1a62ea' }}>%</span>
                  </div>
                </div>

                {/* Preset Chips */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                  {[
                    { label: '0% Restricted', val: 0 },
                    { label: '5% Standard', val: 5 },
                    { label: '10% Senior', val: 10 },
                    { label: '20% Manager', val: 20 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => setModalCapPercent(String(preset.val))}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: `1px solid ${Number(modalCapPercent) === preset.val ? '#1a62ea' : '#cbd5e1'}`,
                        background: Number(modalCapPercent) === preset.val ? '#eff6ff' : '#ffffff',
                        color: Number(modalCapPercent) === preset.val ? '#1a62ea' : '#475569',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Justification Reason Field */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 750, color: '#334155', marginBottom: '6px' }}>
                  Audit Justification Reason (Required by Invariant OD-07)
                </label>
                <textarea
                  rows={3}
                  value={modalAuditReason}
                  onChange={(e) => setModalAuditReason(e.target.value)}
                  placeholder="Enter detailed reason for this discount limit change..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1.5px solid ${modalAuditReason.trim().length >= 3 ? '#cbd5e1' : '#fca5a5'}`,
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  required
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: modalAuditReason.trim().length >= 3 ? '#64748b' : '#dc2626', marginTop: '4px' }}>
                  <span>{modalAuditReason.trim().length >= 3 ? '✓ Valid justification' : 'Minimum 3 characters required'}</span>
                  <span>{modalAuditReason.length} characters</span>
                </div>
              </div>

              {/* OD-07 Invariant Notice */}
              <div style={{ fontSize: '11.5px', color: '#64748b', background: '#eff6ff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                🔒 <strong>OD-07 Rule:</strong> This percentage applies equally to line-item discounts and cart-level discounts. Anti-stacking is enforced.
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
                  disabled={modalAuditReason.trim().length < 3 || savingUserId === editingUser.id}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    background: modalAuditReason.trim().length >= 3 ? '#1a62ea' : '#94a3b8',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 750,
                    cursor: modalAuditReason.trim().length >= 3 ? 'pointer' : 'default',
                    boxShadow: modalAuditReason.trim().length >= 3 ? '0 2px 6px rgba(26, 98, 234, 0.28)' : 'none',
                  }}
                >
                  {savingUserId === editingUser.id ? 'Saving…' : 'Save & Log Audit'}
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
                    Discount Limit Audit Trail (OD-07)
                  </h2>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Immutable historical ledger of discount ceiling adjustments
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
              Each time an administrator updates a discount limit, the backend records the <strong>previous value</strong>, <strong>new value</strong>, <strong>administrator account ID</strong>, <strong>timestamp</strong>, and <strong>mandatory justification reason</strong>.
            </div>

            {/* Audit Log Entries Table */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 150px 90px 1fr', padding: '9px 12px', background: '#f1f5f9', fontSize: '10.5px', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>
                <div>Timestamp</div>
                <div>Target Account</div>
                <div>Cap Delta</div>
                <div>Justification Reason</div>
              </div>

              {[
                { time: 'Today, 17:42', target: 'm.das@premiumretail.com', delta: '5% → 10%', reason: 'Promoted to senior cashier for West End outlet lane 1' },
                { time: 'Yesterday, 11:15', target: 'manager@premiumretail.com', delta: '15% → 20%', reason: 'Downtown Store Manager authority adjustment' },
                { time: '14-Nov-2026', target: 'cashier@premiumretail.com', delta: '0% → 5%', reason: 'Initial checkout terminal provision' },
                { time: '10-Nov-2026', target: 'k.rao@premiumretail.com', delta: '0% → 5%', reason: 'North Mall retail store onboarding' },
              ].map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 150px 90px 1fr',
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
                Bulk Preset Policy
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

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 750, color: '#334155', marginBottom: '5px' }}>
                  Standard Cap Percentage (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max={maximumAuthority}
                  step="0.5"
                  value={bulkPercent}
                  onChange={(e) => setBulkPercent(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 750, color: '#334155', marginBottom: '5px' }}>
                  Audit Justification Reason
                </label>
                <input
                  type="text"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder="Reason for role-wide update (min 3 chars)..."
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
