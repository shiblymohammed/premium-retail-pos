'use client';

import {
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  CreditCard,
  Ellipsis,
  FileText,
  Folder,
  FolderOpen,
  Info,
  LayoutGrid,
  Link2,
  List,
  MapPin,
  Package,
  Pencil,
  Plus,
  UserRound,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import { QuickAccessCard } from '@/components/admin';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  employeeCode: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'STORE_MANAGER' | 'CENTRAL_MANAGER' | 'SUB_WAREHOUSE_MANAGER' | 'CASHIER' | 'STAFF';
  assignedLocations: string[];
  discountLimitPercent: number;
  canCancelSales: boolean;
  canProcessReturns: boolean;
  canCountStockAudits: boolean;
  isActive: boolean;
  joinedDate: string;
}

type ManagedLocation = { id: string; name: string };

const ROLE_OPTIONS = [
  { value: 'ALL', label: 'All Roles' },
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Admin Director' },
  { value: 'STORE_MANAGER', label: 'Store Manager' },
  { value: 'CENTRAL_MANAGER', label: 'Central Warehouse' },
  { value: 'SUB_WAREHOUSE_MANAGER', label: 'Sub Warehouse' },
  { value: 'CASHIER', label: 'Cashier Station' },
  { value: 'STAFF', label: 'Floor Staff' },
];

const roleLabels: Record<string, string> = {
  ALL: 'All Roles',
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin Director',
  STORE_MANAGER: 'Store Manager',
  CENTRAL_MANAGER: 'Central Warehouse',
  SUB_WAREHOUSE_MANAGER: 'Sub Warehouse',
  CASHIER: 'Cashier Station',
  STAFF: 'Floor Staff',
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [availableLocations, setAvailableLocations] = useState<ManagedLocation[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [notice, setNotice] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  // Fail closed while the signed-in role is being hydrated; never briefly
  // render Super Admin-only role options for another administrator.
  const [currentUserRole, setCurrentUserRole] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formEmployeeCode, setFormEmployeeCode] = useState('');
  const [formRole, setFormRole] = useState<ManagedUser['role']>('CASHIER');
  const [formLocations, setFormLocations] = useState<string[]>([]);

  // Google Drive Reference UI State
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<'ROLE' | 'LOCATION' | 'STATUS' | null>(null);

  useEffect(() => {
    // Listen for global user creation trigger from sidebar action pill
    const handleOpen = () => openCreateModal();
    window.addEventListener('open-user-modal', handleOpen);

    // Support search query parameter from global topbar search pill
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) setSearch(q);

    // Close open menus on outside click
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.custom-filter-dropdown-wrap')) {
        setOpenDropdown(null);
      }
      if (!target.closest('.user-action-menu-wrap')) {
        setActiveActionMenuId(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);

    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('open-user-modal', handleOpen);
    };
  }, []);

  useEffect(() => {
    const session = getStoredSession();
    if (session?.user?.role) {
      setCurrentUserRole(session.user.role);
    }

    if (!session?.accessToken) {
      setNotice('Sign in as Super Admin to manage real user accounts.');
      return;
    }
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    Promise.all([
      fetch(`${API_BASE}/users`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE}/locations?isActive=true`, { headers, cache: 'no-store' }),
    ])
      .then(async ([usersResponse, locationsResponse]) => {
        if (!usersResponse.ok || !locationsResponse.ok) throw new Error('Could not load users and locations from the API.');
        const [userPayload, locationPayload] = await Promise.all([usersResponse.json(), locationsResponse.json()]);
        const locationRecords: ManagedLocation[] = Array.isArray(locationPayload.data) ? locationPayload.data.map((location: any) => ({ id: location.id, name: location.name })) : [];
        setAvailableLocations(locationRecords);
        const locationNameById = new Map(locationRecords.map((location) => [location.id, location.name]));
        const mapped: ManagedUser[] = Array.isArray(userPayload.data) ? userPayload.data.map((user: any) => ({
          id: user.id,
          name: user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user.email.split('@')[0],
          email: user.email,
          employeeCode: user.employee?.employeeCode || '',
          role: user.role,
          assignedLocations: (user.locationScopes || []).map((scope: any) => locationNameById.get(scope.locationId) || scope.locationId),
          discountLimitPercent: Number(user.discountLimitPercent) || 0,
          canCancelSales: Boolean(user.canCancelSales),
          canProcessReturns: Boolean(user.canProcessReturns),
          canCountStockAudits: Boolean(user.canCountStockAudits),
          isActive: user.isActive !== false,
          joinedDate: user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
        })) : [];
        setUsers(mapped);
        setNotice('');
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Could not load users from the API.'));
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        !search.trim() ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.employeeCode.toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
      const matchLoc = locationFilter === 'ALL' || u.assignedLocations.includes(locationFilter);
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && u.isActive) ||
        (statusFilter === 'INACTIVE' && !u.isActive);

      return matchSearch && matchRole && matchLoc && matchStatus;
    });
  }, [users, search, roleFilter, locationFilter, statusFilter]);

  const kpis = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.isActive).length;
    const managers = users.filter((u) => u.role === 'STORE_MANAGER' && u.isActive).length;
    const cashiers = users.filter((u) => u.role === 'CASHIER' && u.isActive).length;
    const warehouse = users.filter((u) => (u.role === 'CENTRAL_MANAGER' || u.role === 'SUB_WAREHOUSE_MANAGER') && u.isActive).length;
    return { total, active, managers, cashiers, warehouse };
  }, [users]);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormEmployeeCode('');
    setFormRole('CASHIER');
    setFormLocations([]);
    setIsModalOpen(true);
  };

  const openEditModal = (u: ManagedUser) => {
    setEditingUser(u);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormPassword('');
    setFormEmployeeCode(u.employeeCode);
    setFormRole(u.role);
    setFormLocations([...u.assignedLocations]);
    setIsModalOpen(true);
  };

  const handleToggleLocation = (loc: string) => {
    setFormLocations((prev) =>
      prev.includes(loc) ? prev.filter((item) => item !== loc) : [...prev, loc]
    );
  };

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!formEmail.trim() || (formRole !== 'SUPER_ADMIN' && !formName.trim())) {
      alert('Name and Email are required for employee accounts.');
      return;
    }
    if (formRole !== 'SUPER_ADMIN' && formLocations.length === 0) {
      alert('Choose at least one active location for this role.');
      return;
    }
    if (!editingUser && formRole !== 'SUPER_ADMIN' && (!formName.trim() || !formEmployeeCode.trim())) {
      alert('Enter the employee name and code for this account.');
      return;
    }
    const session = getStoredSession();
    if (!session?.accessToken) { setNotice('Your session has expired. Sign in again.'); return; }
    if (!editingUser && formPassword.length < 12) { alert('Set an initial password with at least 12 characters.'); return; }
    const locationIds = formLocations.map((name) => availableLocations.find((location) => location.name === name)?.id).filter((id): id is string => Boolean(id));
    setSavingUser(true);
    try {
      const response = await fetch(`${API_BASE}/users${editingUser ? `/${editingUser.id}` : ''}`, {
        method: editingUser ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(editingUser
          ? { role: formRole, locationIds }
          : { email: formEmail.trim(), password: formPassword, role: formRole, locationIds }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'The server could not save this user.');
      const saved = payload.data;
      const mapped: ManagedUser = {
        id: saved.id,
        name: formName.trim() || saved.email.split('@')[0],
        email: saved.email,
        employeeCode: formEmployeeCode.trim(),
        role: saved.role,
        assignedLocations: formLocations,
        discountLimitPercent: Number(saved.discountLimitPercent) || 0,
        canCancelSales: Boolean(saved.canCancelSales),
        canProcessReturns: Boolean(saved.canProcessReturns),
        canCountStockAudits: Boolean(saved.canCountStockAudits),
        isActive: saved.isActive !== false,
        joinedDate: saved.createdAt ? new Date(saved.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
      };
      setUsers((current) => editingUser ? current.map((user) => user.id === saved.id ? { ...user, ...mapped } : user) : [mapped, ...current]);
      setNotice(`User account ${saved.email} ${editingUser ? 'updated' : 'created'} successfully.`);
      setIsModalOpen(false);
      if (!editingUser && formRole !== 'SUPER_ADMIN') {
        const nameParts = formName.trim().split(/\s+/);
        const employeeResponse = await fetch(`${API_BASE}/employees`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ userId: saved.id, employeeCode: formEmployeeCode.trim(), firstName: nameParts[0], lastName: nameParts.slice(1).join(' ') || nameParts[0], locationId: locationIds[0], hireDate: new Date().toISOString().slice(0, 10) }),
        });
        const employeePayload = await employeeResponse.json().catch(() => ({}));
        if (!employeeResponse.ok) {
          setNotice(`Account ${saved.email} was created, but the employee profile failed: ${employeePayload.message || 'create it from Employee Management.'}`);
          return;
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The user could not be saved.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleStatus = async (userId: string) => {
    const user = users.find((item) => item.id === userId);
    const session = getStoredSession();
    if (!user || !session?.accessToken) return;
    if (!user.isActive) { setNotice('Reactivation is not currently available from this screen.'); return; }
    try {
      const response = await fetch(`${API_BASE}/users/${userId}/deactivate`, { method: 'PATCH', headers: { Authorization: `Bearer ${session.accessToken}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Could not deactivate this account.');
      setUsers((current) => current.map((item) => item.id === userId ? { ...item, isActive: false } : item));
      setNotice(`User ${user.email} deactivated. Existing refresh sessions were revoked.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not deactivate this account.'); }
  };

  const getRoleBadgeStyle = (role: ManagedUser['role']) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' };
      case 'ADMIN':
        return { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' };
      case 'STORE_MANAGER':
        return { background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' };
      case 'CENTRAL_MANAGER':
        return { background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' };
      case 'SUB_WAREHOUSE_MANAGER':
        return { background: '#f0fdfa', color: '#0d9488', border: '1px solid #99f6e4' };
      case 'CASHIER':
        return { background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' };
      case 'STAFF':
      default:
        return { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' };
    }
  };

  const copyUserQuickInfo = (u: ManagedUser) => {
    const info = `User: ${u.name} | Email: ${u.email} | Role: ${u.role} | Code: ${u.employeeCode} | Stores: ${u.assignedLocations.join(', ')}`;
    navigator.clipboard.writeText(info);
    setNotice(`Credentials and store access for ${u.email} copied to clipboard!`);
  };

  const getRoleIconBadge = (role: ManagedUser['role']) => {
    switch (role) {
      case 'SUPER_ADMIN':
      case 'ADMIN':
        return {
          icon: <FileText size={13} aria-hidden="true" />,
          bg: '#e8f0fe',
          color: '#1a62ea',
          border: '#d2e3fc',
        };
      case 'STORE_MANAGER':
        return {
          icon: <ChartNoAxesColumn size={13} aria-hidden="true" />,
          bg: '#e6f4ea',
          color: '#137333',
          border: '#ceead6',
        };
      case 'CASHIER':
        return {
          icon: <CreditCard size={13} aria-hidden="true" />,
          bg: '#fef7e0',
          color: '#b06000',
          border: '#feefc3',
        };
      case 'CENTRAL_MANAGER':
      case 'SUB_WAREHOUSE_MANAGER':
        return {
          icon: <Package size={13} aria-hidden="true" />,
          bg: '#f3e8fd',
          color: '#8430ce',
          border: '#e9d2fd',
        };
      case 'STAFF':
      default:
        return {
          icon: <UserRound size={13} aria-hidden="true" />,
          bg: '#f1f3f4',
          color: '#5f6368',
          border: '#dadce0',
        };
    }
  };

  return (
    <div className="app-page" style={{ color: '#1e293b' }}>
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
          <span style={{ fontWeight: 600 }}><Check size="1em" className="inline-icon" aria-hidden="true" /> {notice}</span>
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setNotice('')}
            style={{ background: 'none', border: 'none', color: '#065f46', cursor: 'pointer', fontWeight: 800, fontSize: '14px' }}
          >
            <X size="1em" className="inline-icon" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Header: User Directory with Blue Folder Badge + View Switchers */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 850, margin: 0, color: '#1e293b', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            User Directory
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
              title="Dual-Axis Directory"
            >
              <Folder size="1em" className="inline-icon" aria-hidden="true" />
            </span>
          </h1>
        </div>

        {/* Right side: View Mode Toggles, Info, and Provision User Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              style={{
                border: 'none',
                background: viewMode === 'list' ? '#ffffff' : 'transparent',
                color: viewMode === 'list' ? '#1a62ea' : '#64748b',
                padding: '6px 10px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
              title="List View"
            >
              <List size="1em" className="inline-icon" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              style={{
                border: 'none',
                background: viewMode === 'grid' ? '#ffffff' : 'transparent',
                color: viewMode === 'grid' ? '#1a62ea' : '#64748b',
                padding: '6px 10px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
              title="Grid View"
            >
              <LayoutGrid size="1em" className="inline-icon" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => alert(`Total Accounts: ${kpis.total}\nActive Supervisors: ${kpis.managers}\nCashier Stations: ${kpis.cashiers}\nDepot Logistics: ${kpis.warehouse}`)}
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
            title="Directory Info"
          >
            <Info size="1em" className="inline-icon" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={openCreateModal}
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
            <span style={{ fontSize: '15px' }}><Plus size="1em" className="inline-icon" aria-hidden="true" /></span> Provision New User
          </button>
        </div>
      </div>

      {/* SECTION 1: QUICK ACCESS (Row of 4 Folder-Tabbed Cards matching the reference image) */}
      <div style={{ marginBottom: '34px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: '#475569', textTransform: 'uppercase', margin: '0 0 14px' }}>
          QUICK ACCESS
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
          {/* Folder Card 1: Store Managers (Deep royal blue when active) */}
          <QuickAccessCard
            isActive={roleFilter === 'STORE_MANAGER'}
            onClick={() => setRoleFilter(roleFilter === 'STORE_MANAGER' ? 'ALL' : 'STORE_MANAGER')}
            title="Filter by Store Managers"
            avatars={[
              { text: 'AP', bg: '#059669' },
              { text: 'RD', bg: '#0d9488' },
              { text: 'SM', bg: '#2563eb' },
            ]}
            heading="Store Managers"
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
            heading="Cashiers & POS"
            subheading={`${kpis.cashiers} Checkout Terminals · 5% Disc Cap`}
          />

          {/* Folder Card 3: Warehouse & Depot */}
          <QuickAccessCard
            isActive={roleFilter === 'CENTRAL_MANAGER' || roleFilter === 'SUB_WAREHOUSE_MANAGER'}
            onClick={() => setRoleFilter(roleFilter === 'CENTRAL_MANAGER' ? 'ALL' : 'CENTRAL_MANAGER')}
            title="Filter by Warehouse Logistics"
            avatars={[
              { text: 'VS', bg: '#4f46e5' },
              { text: 'RK', bg: '#6366f1' },
            ]}
            heading="Warehouse Logistics"
            subheading={`${kpis.warehouse} Depot Managers · Stock Audits`}
          />

          {/* Summary Card 4: Executive Admins (Styled exactly like 4th card in reference image) */}
          <div
            className={`drive-folder-card${roleFilter === 'SUPER_ADMIN' || roleFilter === 'ADMIN' ? ' active-folder' : ''}`}
            onClick={() => setRoleFilter(roleFilter === 'SUPER_ADMIN' ? 'ALL' : 'SUPER_ADMIN')}
            title="Filter by Executive Admins"
            style={{ borderLeft: '4px solid #1a62ea' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px', color: '#1a62ea' }}><FileText size="1em" className="inline-icon" aria-hidden="true" /></span>
                <strong style={{ fontSize: '13.5px', color: '#1e293b' }}>Executive Admins</strong>
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
                Enterprise RBAC & Security Invariants
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: ALL USERS (Matching ALL FILES in the reference image) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: '#475569', textTransform: 'uppercase', margin: 0 }}>
            ALL USERS ({filteredUsers.length})
          </h2>

          {/* Filter Toolbar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Filter users by name, email..."
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
                        {isSelected && <span style={{ color: '#1a62ea', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
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
                <span><MapPin size="1em" className="inline-icon" aria-hidden="true" /></span>
                <span>{locationFilter === 'ALL' ? 'All Locations' : locationFilter}</span>
                <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '2px' }}><ChevronDown size="1em" className="inline-icon" aria-hidden="true" /></span>
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
                    onMouseEnter={(e) => {
                      if (locationFilter !== 'ALL') e.currentTarget.style.background = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      if (locationFilter !== 'ALL') e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>All Store Locations</span>
                    {locationFilter === 'ALL' && <span style={{ color: '#1a62ea', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
                  </button>
                  {availableLocations.map((location) => {
                    const loc = location.name;
                    const isSelected = locationFilter === loc;
                    return (
                      <button
                        key={loc}
                        type="button"
                        onClick={() => {
                          setLocationFilter(loc);
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
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: '#1a62ea' }}><MapPin size="1em" className="inline-icon" aria-hidden="true" /></span>
                          {loc}
                        </span>
                        {isSelected && <span style={{ color: '#1a62ea', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Custom Styled Status Dropdown */}
            <div className="custom-filter-dropdown-wrap" style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'STATUS' ? null : 'STATUS')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '20px',
                  border: statusFilter !== 'ALL' ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                  background: statusFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
                  color: statusFilter !== 'ALL' ? '#1d4ed8' : '#334155',
                  fontSize: '12.5px',
                  fontWeight: 650,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusFilter === 'ACTIVE' ? '#16a34a' : statusFilter === 'INACTIVE' ? '#94a3b8' : '#64748b' }}></span>
                <span>{statusFilter === 'ALL' ? 'All Statuses' : statusFilter === 'ACTIVE' ? 'Active Only' : 'Inactive Only'}</span>
                <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '2px' }}><ChevronDown size="1em" className="inline-icon" aria-hidden="true" /></span>
              </button>

              {openDropdown === 'STATUS' && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    width: '180px',
                    background: '#ffffff',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
                    padding: '6px',
                    zIndex: 60,
                  }}
                >
                  <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    ACCOUNT STATUS
                  </div>
                  {[
                    { value: 'ALL', label: 'All Statuses', dot: '#64748b' },
                    { value: 'ACTIVE', label: 'Active Only', dot: '#16a34a' },
                    { value: 'INACTIVE', label: 'Inactive Only', dot: '#94a3b8' },
                  ].map((st) => {
                    const isSelected = statusFilter === st.value;
                    return (
                      <button
                        key={st.value}
                        type="button"
                        onClick={() => {
                          setStatusFilter(st.value);
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
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: st.dot }}></span>
                          {st.label}
                        </span>
                        {isSelected && <span style={{ color: '#1a62ea', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {(search || roleFilter !== 'ALL' || locationFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setRoleFilter('ALL');
                  setLocationFilter('ALL');
                  setStatusFilter('ALL');
                }}
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

        {/* File Table / User Directory Table */}
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
                  <th style={{ padding: '14px 20px', width: '30%' }}>USER IDENTITY</th>
                  <th style={{ padding: '14px 16px', width: '22%' }}>ASSIGNED STORE</th>
                  <th style={{ padding: '14px 16px', width: '18%' }}>JOINED DATE</th>
                  <th style={{ padding: '14px 16px', width: '20%' }}>DISCOUNT CAP & PERMISSIONS</th>
                  <th style={{ padding: '14px 20px', width: '10%', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}><FolderOpen size="1em" className="inline-icon" aria-hidden="true" /></div>
                      <strong>No accounts matching the active filters</strong>
                      <p style={{ margin: '4px 0 0', fontSize: '12px' }}>Try resetting the filters or provision a new user.</p>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const initials = u.name.slice(0, 2).toUpperCase();
                    const badge = getRoleIconBadge(u.role);
                    const isSelected = selectedUserId === u.id;

                    return (
                      <tr
                        key={u.id}
                        onClick={() => setSelectedUserId(u.id)}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: isSelected ? '#edf4fe' : '#ffffff',
                          cursor: 'pointer',
                          transition: 'background 0.12s ease',
                          opacity: u.isActive ? 1 : 0.65,
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = '#f8fafd';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = '#ffffff';
                        }}
                      >
                        {/* Column 1: NAME (Colored Role/Document Icon + User Name + Subtitle) */}
                        <td style={{ padding: '13px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                background: badge.bg,
                                border: `1px solid ${badge.border}`,
                                color: badge.color,
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: '15px',
                                flexShrink: 0,
                              }}
                            >
                              {badge.icon}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <strong style={{ color: '#0f172a', fontSize: '13.5px', display: 'block', fontWeight: 700 }}>
                                {u.name}
                              </strong>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                <span style={{ color: '#64748b', fontSize: '11.5px' }}>{u.email}</span>
                                <span
                                  style={{
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    background: '#f1f5f9',
                                    color: '#475569',
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    fontWeight: 600,
                                  }}
                                >
                                  {u.employeeCode}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Column 2: OWNERS / LOCATION (Circular avatar cluster + store binding) */}
                        <td style={{ padding: '13px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                              style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                background: badge.bg,
                                color: badge.color,
                                display: 'grid',
                                placeItems: 'center',
                                fontWeight: 800,
                                fontSize: '10.5px',
                                border: '1.5px solid #ffffff',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                              }}
                            >
                              {initials}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              <span
                                style={{
                                  fontSize: '11.5px',
                                  color: '#334155',
                                  fontWeight: 600,
                                  background: '#f8fafc',
                                  padding: '2px 7px',
                                  borderRadius: '5px',
                                  border: '1px solid #e2e8f0',
                                }}
                              >
                                {u.assignedLocations[0] || 'Unassigned'}
                                {u.assignedLocations.length > 1 && ` +${u.assignedLocations.length - 1}`}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Column 3: JOINED DATE */}
                        <td style={{ padding: '13px 16px', color: '#64748b', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                          Joined {u.joinedDate}
                        </td>

                        {/* Column 4: DISCOUNT CAP & PERMISSIONS */}
                        <td style={{ padding: '13px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: '12px',
                                background: u.discountLimitPercent > 0 ? '#eff6ff' : '#f1f5f9',
                                color: u.discountLimitPercent > 0 ? '#1d4ed8' : '#475569',
                                border: u.discountLimitPercent > 0 ? '1px solid #bfdbfe' : '1px solid #cbd5e1',
                                fontSize: '11.5px',
                                fontWeight: 700,
                              }}
                            >
                              {u.discountLimitPercent > 0 ? `Max ${u.discountLimitPercent}% Disc` : '0% Cap'}
                            </span>
                            <div style={{ display: 'inline-flex', gap: '3px' }}>
                              {u.canCancelSales && (
                                <span title="Can void and cancel sales" style={{ padding: '2px 5px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontSize: '10.5px', fontWeight: 700 }}>
                                  Void
                                </span>
                              )}
                              {u.canProcessReturns && (
                                <span title="Can process returns" style={{ padding: '2px 5px', borderRadius: '4px', background: '#fef3c7', color: '#b45309', fontSize: '10.5px', fontWeight: 700 }}>
                                  Return
                                </span>
                              )}
                              {u.canCountStockAudits && (
                                <span title="Can record stock audit counts" style={{ padding: '2px 5px', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontSize: '10.5px', fontWeight: 700 }}>
                                  Audit
                                </span>
                              )}
                            </div>
                            {u.isActive ? (
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a' }} title="Active Session"></span>
                            ) : (
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94a3b8' }} title="Inactive"></span>
                            )}
                          </div>
                        </td>

                        {/* Column 5: Copy details and more actions */}
                        <td style={{ padding: '13px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyUserQuickInfo(u);
                              }}
                              style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '6px',
                                border: 'none',
                                background: 'transparent',
                                color: '#64748b',
                                fontSize: '15px',
                                cursor: 'pointer',
                                display: 'grid',
                                placeItems: 'center',
                              }}
                              title="Copy User Access Details"
                            >
                              <Link2 size="1em" className="inline-icon" aria-hidden="true" />
                            </button>

                            <div className="user-action-menu-wrap" style={{ position: 'relative' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveActionMenuId(activeActionMenuId === u.id ? null : u.id);
                                }}
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: 'transparent',
                                  color: '#64748b',
                                  fontSize: '18px',
                                  fontWeight: 900,
                                  cursor: 'pointer',
                                  display: 'grid',
                                  placeItems: 'center',
                                }}
                                title="More Actions"
                              >
                                <Ellipsis size="1em" className="inline-icon" aria-hidden="true" />
                              </button>

                              {/* Action Menu Popover */}
                              {activeActionMenuId === u.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    position: 'absolute',
                                    right: 0,
                                    top: '34px',
                                    background: '#ffffff',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.12)',
                                    zIndex: 50,
                                    width: '180px',
                                    padding: '6px',
                                    textAlign: 'left',
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveActionMenuId(null);
                                      openEditModal(u);
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '8px 10px',
                                      borderRadius: '6px',
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#1e293b',
                                      fontSize: '12.5px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                    }}
                                  >
                                    <span><Pencil size="1em" className="inline-icon" aria-hidden="true" /></span> Edit Account
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveActionMenuId(null);
                                      handleToggleStatus(u.id);
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '8px 10px',
                                      borderRadius: '6px',
                                      border: 'none',
                                      background: 'transparent',
                                      color: u.isActive ? '#dc2626' : '#16a34a',
                                      fontSize: '12.5px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                    }}
                                  >
                                    <span>{u.isActive ? <X size="1em" className="inline-icon" aria-hidden="true" /> : <Check size="1em" className="inline-icon" aria-hidden="true" />}</span> {u.isActive ? 'Deactivate' : 'Reactivate'}
                                  </button>
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
        </div>
      </div>

      {/* CREATE / EDIT USER MODAL */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 1000,
            display: 'grid',
            placeItems: 'center',
            padding: '20px',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              padding: '28px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  {editingUser ? 'Edit User Credentials & Access' : 'Provision New Enterprise Account'}
                </h2>
                <small style={{ color: '#64748b' }}>
                  Enforces dual-axis physical store binding and RBAC controls.
                </small>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#64748b', cursor: 'pointer' }}
              >
                <X size="1em" className="inline-icon" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveUser}>
              {formRole !== 'SUPER_ADMIN' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Ramesh Verma"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Employee Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={formEmployeeCode}
                    onChange={(e) => setFormEmployeeCode(e.target.value)}
                    placeholder="EMP-0845"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="r.verma@premiumretail.com"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Operational Role *
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                  >
                    <option value="CASHIER">CASHIER (POS Lane)</option>
                    <option value="STAFF">STAFF (Floor Operations)</option>
                    <option value="STORE_MANAGER">STORE_MANAGER (Store Lead)</option>
                    <option value="CENTRAL_MANAGER">CENTRAL_MANAGER (Main WH)</option>
                    <option value="SUB_WAREHOUSE_MANAGER">SUB_WAREHOUSE_MANAGER (Depot)</option>
                    {currentUserRole === 'SUPER_ADMIN' && (
                      <>
                        <option value="ADMIN">ADMIN (Scoped Administrator)</option>
                        <option value="SUPER_ADMIN">SUPER_ADMIN (Global)</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {!editingUser && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Initial Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={12}
                    placeholder="At least 12 characters"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              )}

              {/* Physical Location Binding */}
              {formRole !== 'SUPER_ADMIN' && (
              <div style={{ marginBottom: '16px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                  Authorized Physical Store Locations (Dual-Axis Invariant) *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {availableLocations.map((location) => {
                    const loc = location.name;
                    const checked = formLocations.includes(loc);
                    return (
                      <label
                        key={loc}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '12px',
                          color: '#334155',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleLocation(loc)}
                        />
                        <span>{loc}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '13px',
                    fontWeight: 650,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    background: '#155eef',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {editingUser ? 'Save Changes' : 'Create User & Bind Stores'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
