'use client';

import {
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  CreditCard,
  FileText,
  FolderOpen,
  LayoutGrid,
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
import { AdminModal } from '@/components/admin';
import { AdminActionMenu } from '@/components/admin/admin-action-menu';
import { Feedback } from '@/components/ui/feedback';
import Link from 'next/link';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export interface ManagedUser {
  id: string;
  employeeId?: string;
  employeeDetails?: { phone: string | null; address: string | null; designation: string | null; hireDate: string; monthlyBaseSalary: string | null };
  name: string;
  email: string;
  employeeCode: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'STORE_MANAGER' | 'CENTRAL_MANAGER' | 'SUB_WAREHOUSE_MANAGER' | 'CASHIER' | 'STAFF' | 'INVENTORY';
  assignedLocations: string[];
  assignedLocationIds: string[];
  discountLimitPercent: number;
  canCancelSales: boolean;
  canProcessReturns: boolean;
  canCountStockAudits: boolean;
  isActive: boolean;
  joinedDate: string;
}

type PermissionPreset = {
  canProcessReturns: boolean;
  canCancelSales: boolean;
  canCountStockAudits: boolean;
  discountLimitPercent: number;
};

const permissionFields = [
  ['canProcessReturns', 'Process returns'],
  ['canCancelSales', 'Cancel sales'],
  ['canCountStockAudits', 'Grant stock count entry'],
] as const;

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
  { value: 'INVENTORY', label: 'Inventory' },
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
  INVENTORY: 'Inventory',
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [directoryState, setDirectoryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [availableLocations, setAvailableLocations] = useState<ManagedLocation[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [notice, setNoticeState] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const setNotice = (msg: string | { message: string; type: 'success' | 'error' } | null, explicitType?: 'success' | 'error') => {
    if (!msg) {
      setNoticeState(null);
      return;
    }
    if (typeof msg === 'object') {
      setNoticeState(msg);
      return;
    }
    const isError = explicitType === 'error' || (explicitType === undefined && /error|fail|could not|cannot|invalid|required|expired|must|again|not available/i.test(msg));
    setNoticeState({ message: msg, type: isError ? 'error' : 'success' });
  };
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
  const [locationSearch, setLocationSearch] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formEmployeeCode, setFormEmployeeCode] = useState('');
  const [formHireDate, setFormHireDate] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formDesignation, setFormDesignation] = useState('');
  const [formSalary, setFormSalary] = useState('');
  const [formRole, setFormRole] = useState<ManagedUser['role']>('CASHIER');
  const [presets, setPresets] = useState<Record<string, PermissionPreset>>({});
  const [presetError, setPresetError] = useState('');
  const [permissionOverrides, setPermissionOverrides] = useState<Partial<PermissionPreset>>({});
  const preset = presets[formRole];
  const [formLocations, setFormLocations] = useState<string[]>([]);

  // Google Drive Reference UI State
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    if (window.matchMedia('(max-width: 760px)').matches) setViewMode('grid');
  }, []);
  const [permissionReview, setPermissionReview] = useState('');
  const [formError, setFormError] = useState('');
  const [deactivateUser, setDeactivateUser] = useState<ManagedUser | null>(null);
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
      setDirectoryState('error');
      setNotice('Sign in as Super Admin to manage real user accounts.');
      return;
    }
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    void fetch(`${API_BASE}/users/role-presets`, { headers, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load role presets.');
        const { data } = await response.json() as { data: Record<string, PermissionPreset> };
        setPresets(data);
      })
      .catch(() => setPresetError('Could not load role presets.'));
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
          employeeId: user.employee?.id,
          employeeDetails: user.employee,
          name: user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user.email.split('@')[0],
          email: user.email,
          employeeCode: user.employee?.employeeCode || '',
          role: user.role,
          assignedLocationIds: (user.locationScopes || []).map((scope: { locationId: string }) => scope.locationId),
          assignedLocations: (user.locationScopes || []).map((scope: any) => locationNameById.get(scope.locationId) || scope.locationId),
          discountLimitPercent: Number(user.discountLimitPercent) || 0,
          canCancelSales: Boolean(user.canCancelSales),
          canProcessReturns: Boolean(user.canProcessReturns),
          canCountStockAudits: Boolean(user.canCountStockAudits),
          isActive: user.isActive !== false,
          joinedDate: user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
        })) : [];
        setUsers(mapped);
        setDirectoryState('ready');
      })
      .catch((error: unknown) => {
        setDirectoryState('error');
        setNotice(error instanceof Error ? error.message : 'Could not load users from the API.', 'error');
      });
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
    setFormError('');
    setPermissionReview('');
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setLocationSearch('');
    setFormEmployeeCode('');
    setFormHireDate(new Date().toLocaleDateString('sv-SE'));
    setFormPhone('');
    setFormAddress('');
    setFormDesignation('');
    setFormSalary('');
    setFormRole('CASHIER');
    setPermissionOverrides({});
    setFormLocations([]);
    setIsModalOpen(true);
  };

  const openEditModal = (u: ManagedUser) => {
    setFormError('');
    setPermissionReview('');
    setEditingUser(u);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormPassword('');
    setLocationSearch('');
    setFormEmployeeCode(u.employeeCode);
    setFormHireDate(u.employeeDetails?.hireDate?.slice(0, 10) ?? new Date().toLocaleDateString('sv-SE'));
    setFormPhone(u.employeeDetails?.phone ?? '');
    setFormAddress(u.employeeDetails?.address ?? '');
    setFormDesignation(u.employeeDetails?.designation ?? '');
    setFormSalary(u.employeeDetails?.monthlyBaseSalary ?? '');
    setFormRole(u.role);
    setFormLocations([...u.assignedLocationIds]);
    setIsModalOpen(true);
  };

  const handleToggleLocation = (loc: string) => {
    setFormLocations((prev) =>
      prev.includes(loc) ? prev.filter((item) => item !== loc) : [...prev, loc]
    );
  };

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    if (savingUser) return;
    const needsEmployee = formRole !== 'SUPER_ADMIN' && formRole !== 'ADMIN';
    if (!formEmail.trim() || (needsEmployee && !formName.trim())) {
      setFormError('Name and Email are required for employee accounts.');
      return;
    }
    if (formRole !== 'SUPER_ADMIN' && formLocations.length === 0) {
      setFormError('Choose at least one active location for this role.');
      return;
    }
    if (!editingUser && needsEmployee && (!formName.trim() || !formEmployeeCode.trim())) {
      setFormError('Enter the employee name and code for this account.');
      return;
    }
    const session = getStoredSession();
    if (!session?.accessToken) { setFormError('Your session has expired. Sign in again.'); return; }
    if (!editingUser && formPassword.length < 12) { setFormError('Set an initial password with at least 12 characters.'); return; }
    const locationIds = formRole === 'SUPER_ADMIN' ? [] : formLocations;
    if (locationIds.some((id) => !availableLocations.some((location) => location.id === id))) {
      setFormError('Remove inactive locations before saving this account.');
      return;
    }
    const initialPermissions = !editingUser && currentUserRole === 'SUPER_ADMIN' && Object.keys(permissionOverrides).length
      ? { initialPermissions: permissionOverrides } : {};
    const nameParts = formName.trim().split(/\s+/);
    const createEmployeeProfile = !editingUser && needsEmployee;
    const employeeProfile = {
      employeeCode: formEmployeeCode.trim(), firstName: nameParts[0], lastName: nameParts.slice(1).join(' ') || nameParts[0],
      hireDate: formHireDate, phone: formPhone.trim() || null, address: formAddress.trim() || null,
      designation: formDesignation.trim() || null, monthlyBaseSalary: formSalary.trim() || null,
    };
    setFormError('');
    setSavingUser(true);
    try {
      const response = await fetch(`${API_BASE}/users${createEmployeeProfile ? '/with-employee' : editingUser ? `/${editingUser.id}` : ''}`, {
        method: editingUser ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(editingUser
          ? { role: formRole, locationIds, ...(needsEmployee ? { employeeProfile } : {}) }
          : createEmployeeProfile
            ? {
                email: formEmail.trim(), password: formPassword, role: formRole, locationIds,
                ...employeeProfile, ...initialPermissions, locationId: locationIds[0],
              }
            : { email: formEmail.trim(), password: formPassword, role: formRole, locationIds, ...initialPermissions }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'The server could not save this user.');
      const saved = payload.data;
      const mapped: ManagedUser = {
        id: saved.id,
        employeeId: saved.employee?.id ?? editingUser?.employeeId,
        employeeDetails: saved.employee ?? editingUser?.employeeDetails,
        name: formName.trim() || saved.email.split('@')[0],
        email: saved.email,
        employeeCode: formEmployeeCode.trim(),
        role: saved.role,
        assignedLocations: locationIds.map((id) => availableLocations.find((location) => location.id === id)?.name ?? id),
        assignedLocationIds: locationIds,
        discountLimitPercent: Number(saved.discountLimitPercent) || 0,
        canCancelSales: Boolean(saved.canCancelSales),
        canProcessReturns: Boolean(saved.canProcessReturns),
        canCountStockAudits: Boolean(saved.canCountStockAudits),
        isActive: saved.isActive !== false,
        joinedDate: saved.createdAt ? new Date(saved.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
      };
      setUsers((current) => editingUser ? current.map((user) => user.id === saved.id ? { ...user, ...mapped } : user) : [mapped, ...current]);
      if (!editingUser && currentUserRole === 'SUPER_ADMIN' && formRole !== 'SUPER_ADMIN') setPermissionReview(saved.email);
      setNotice(editingUser ? `Account updated for ${saved.email}.` : `Account created for ${saved.email}.`);
      setIsModalOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The user could not be saved.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleStatus = async (userId: string) => {
    setPermissionReview('');
    const user = users.find((item) => item.id === userId);
    const session = getStoredSession();
    if (!user || !session?.accessToken) return;
    try {
      const nextActive = !user.isActive;
      const response = await fetch(`${API_BASE}/users/${userId}/${nextActive ? 'reactivate' : 'deactivate'}`, { method: 'PATCH', headers: { Authorization: `Bearer ${session.accessToken}` }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || `Could not ${nextActive ? 'reactivate' : 'deactivate'} this account.`);
      setUsers((current) => current.map((item) => item.id === userId ? { ...item, isActive: nextActive } : item));
      setNotice(nextActive ? `User ${user.email} reactivated.` : `User ${user.email} deactivated. Existing refresh sessions were revoked.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update this account status.', 'error'); }
  };

  const getRoleBadgeStyle = (role: ManagedUser['role']) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' };
      case 'ADMIN':
        return { background: 'var(--retail-accent-soft)', color: '#2563eb', border: '1px solid var(--retail-accent-line)' };
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
        return { background: 'var(--retail-raised)', color: 'var(--retail-muted)', border: '1px solid var(--retail-edge-strong)' };
    }
  };

  const getRoleIconBadge = (role: ManagedUser['role']) => {
    switch (role) {
      case 'SUPER_ADMIN':
      case 'ADMIN':
        return {
          icon: <FileText size={13} aria-hidden="true" />,
          bg: '#e8f0fe',
          color: 'var(--retail-accent-strong)',
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

  function userActions(user: ManagedUser) {
    return <AdminActionMenu label={`Actions for ${user.name || user.email}`}>
      <button type="button" onClick={() => openEditModal(user)}><Pencil size={15} aria-hidden="true" /> Edit account</button>
      {user.isActive
        ? <button type="button" className="admin-action-danger" onClick={() => setDeactivateUser(user)}><X size={15} aria-hidden="true" /> Deactivate account</button>
        : <button type="button" onClick={() => void handleToggleStatus(user.id)}><Check size={15} aria-hidden="true" /> Reactivate account</button>}
    </AdminActionMenu>;
  }

  return (
    <div className="app-page admin-workspace" style={{ color: 'var(--retail-ink)' }}>
      {notice && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            background: notice.type === 'error' ? '#fef2f2' : '#ecfdf5',
            border: `1px solid ${notice.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
            color: notice.type === 'error' ? '#991b1b' : '#065f46',
            fontSize: '13px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: notice.type === 'error' ? '0 2px 8px rgba(239, 68, 68, 0.1)' : '0 2px 8px rgba(16, 185, 129, 0.1)',
          }}
        >
          <span style={{ fontWeight: 600 }}>
            {notice.type === 'error' ? <X size="1em" className="inline-icon" aria-hidden="true" /> : <Check size="1em" className="inline-icon" aria-hidden="true" />}{' '}
            {notice.message}
          </span>
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setNotice('')}
            style={{
              background: 'none',
              border: 'none',
              color: notice.type === 'error' ? '#991b1b' : '#065f46',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: '14px',
            }}
          >
            <X size="1em" className="inline-icon" aria-hidden="true" />
          </button>
        </div>
      )}

      {notice && <Feedback toast tone={notice.type} onDismiss={() => { setNotice(null); setPermissionReview(''); }}
        action={permissionReview ? <Link href={`/admin/sales-permissions?q=${encodeURIComponent(permissionReview)}`}>Review permissions</Link> : undefined}>
        {notice.message}{permissionReview && ' Would you like to review their permissions?'}
      </Feedback>}
      <header className="admin-page-header">
        <div><h1>User Directory</h1><p>Manage accounts and their assigned locations.</p></div>
        <div className="admin-heading-actions">
          <div className="admin-view-switch" role="group" aria-label="Directory view">
            <button type="button" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}><List size={16} aria-hidden="true" /> List</button>
            <button type="button" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}><LayoutGrid size={16} aria-hidden="true" /> Grid</button>
          </div>
          <button type="button" className="admin-primary" disabled={directoryState !== 'ready'} onClick={openCreateModal}><Plus size={16} aria-hidden="true" /> Add user</button>
        </div>
      </header>
      <div className="admin-user-summary" aria-label="Account summary">
        <span><b>{kpis.total}</b> total accounts</span>
        <span><b>{kpis.active}</b> active</span>
        <span><b>{kpis.managers}</b> store managers</span>
        <span><b>{kpis.cashiers}</b> cashiers</span>
        <span><b>{kpis.warehouse}</b> warehouse managers</span>
      </div>

      {/* SECTION 2: ALL USERS (Matching ALL FILES in the reference image) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--retail-muted)', textTransform: 'uppercase', margin: 0 }}>
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
                border: '1px solid var(--retail-edge-strong)',
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
                  border: roleFilter !== 'ALL' ? '1px solid #93c5fd' : '1px solid var(--retail-edge-strong)',
                  background: roleFilter !== 'ALL' ? 'var(--retail-accent-soft)' : 'var(--retail-card)',
                  color: roleFilter !== 'ALL' ? '#1d4ed8' : 'var(--retail-ink)',
                  fontSize: '12.5px',
                  fontWeight: 650,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
              >
                <span><UserRound size="1em" className="inline-icon" aria-hidden="true" /></span>
                <span>{roleLabels[roleFilter] || 'All Roles'}</span>
                <span style={{ fontSize: '9px', color: 'var(--retail-subtle)', marginLeft: '2px' }}><ChevronDown size="1em" className="inline-icon" aria-hidden="true" /></span>
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
                    border: '1px solid var(--retail-edge)',
                    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
                    padding: '6px',
                    zIndex: 60,
                  }}
                >
                  <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 800, color: 'var(--retail-subtle)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
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
                        {isSelected && <span style={{ color: 'var(--retail-accent-strong)', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
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
                  border: locationFilter !== 'ALL' ? '1px solid #93c5fd' : '1px solid var(--retail-edge-strong)',
                  background: locationFilter !== 'ALL' ? 'var(--retail-accent-soft)' : 'var(--retail-card)',
                  color: locationFilter !== 'ALL' ? '#1d4ed8' : 'var(--retail-ink)',
                  fontSize: '12.5px',
                  fontWeight: 650,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
              >
                <span><MapPin size="1em" className="inline-icon" aria-hidden="true" /></span>
                <span>{locationFilter === 'ALL' ? 'All Locations' : locationFilter}</span>
                <span style={{ fontSize: '9px', color: 'var(--retail-subtle)', marginLeft: '2px' }}><ChevronDown size="1em" className="inline-icon" aria-hidden="true" /></span>
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
                    border: '1px solid var(--retail-edge)',
                    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
                    padding: '6px',
                    zIndex: 60,
                  }}
                >
                  <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 800, color: 'var(--retail-subtle)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
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
                    onMouseEnter={(e) => {
                      if (locationFilter !== 'ALL') e.currentTarget.style.background = 'var(--retail-raised)';
                    }}
                    onMouseLeave={(e) => {
                      if (locationFilter !== 'ALL') e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>All Store Locations</span>
                    {locationFilter === 'ALL' && <span style={{ color: 'var(--retail-accent-strong)', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
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
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'var(--retail-accent-strong)' }}><MapPin size="1em" className="inline-icon" aria-hidden="true" /></span>
                          {loc}
                        </span>
                        {isSelected && <span style={{ color: 'var(--retail-accent-strong)', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
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
                  border: statusFilter !== 'ALL' ? '1px solid #93c5fd' : '1px solid var(--retail-edge-strong)',
                  background: statusFilter !== 'ALL' ? 'var(--retail-accent-soft)' : 'var(--retail-card)',
                  color: statusFilter !== 'ALL' ? '#1d4ed8' : 'var(--retail-ink)',
                  fontSize: '12.5px',
                  fontWeight: 650,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
              >
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusFilter === 'ACTIVE' ? '#16a34a' : statusFilter === 'INACTIVE' ? 'var(--retail-subtle)' : 'var(--retail-muted)' }}></span>
                <span>{statusFilter === 'ALL' ? 'All Statuses' : statusFilter === 'ACTIVE' ? 'Active Only' : 'Inactive Only'}</span>
                <span style={{ fontSize: '9px', color: 'var(--retail-subtle)', marginLeft: '2px' }}><ChevronDown size="1em" className="inline-icon" aria-hidden="true" /></span>
              </button>

              {openDropdown === 'STATUS' && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    width: '180px',
                    background: 'var(--retail-card)',
                    borderRadius: '12px',
                    border: '1px solid var(--retail-edge)',
                    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
                    padding: '6px',
                    zIndex: 60,
                  }}
                >
                  <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 800, color: 'var(--retail-subtle)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    ACCOUNT STATUS
                  </div>
                  {[
                    { value: 'ALL', label: 'All Statuses', dot: 'var(--retail-muted)' },
                    { value: 'ACTIVE', label: 'Active Only', dot: '#16a34a' },
                    { value: 'INACTIVE', label: 'Inactive Only', dot: 'var(--retail-subtle)' },
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
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: st.dot }}></span>
                          {st.label}
                        </span>
                        {isSelected && <span style={{ color: 'var(--retail-accent-strong)', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
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
                  color: 'var(--retail-accent-strong)',
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

        {viewMode === 'grid' ? (
          <div className="admin-user-grid" aria-label="User cards">
            {filteredUsers.length === 0 && <p>{directoryState === 'loading' ? 'Loading accounts…' : directoryState === 'error' ? 'Could not load accounts.' : 'No accounts match your filters.'}</p>}
            {filteredUsers.map((user) => <article className="admin-user-card" key={user.id}>
              <header><div><h3>{user.name || user.email}</h3><p>{user.email}</p></div>{userActions(user)}</header>
              <dl>
                <div><dt>Role</dt><dd>{roleLabels[user.role]}</dd></div>
                <div><dt>Status</dt><dd>{user.isActive ? 'Active' : 'Inactive'}</dd></div>
                <div><dt>Locations</dt><dd>{user.assignedLocations.join(', ') || 'Unassigned'}</dd></div>
                <div><dt>Joined</dt><dd>{user.joinedDate || '—'}</dd></div>
                <div><dt>Discount limit</dt><dd>{user.discountLimitPercent}%</dd></div>
                <div><dt>Overrides</dt><dd>{[user.canCancelSales && 'Voids', user.canProcessReturns && 'Returns', user.canCountStockAudits && 'Stock counts'].filter(Boolean).join(', ') || 'None'}</dd></div>
              </dl>
            </article>)}
          </div>
        ) : (
        <div
          style={{
            background: 'var(--retail-card)',
            border: '1px solid var(--retail-edge)',
            borderRadius: '14px',
            overflow: 'hidden',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
          }}
        >
          <div className="admin-table-scroll" tabIndex={0} aria-label="User list">
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
                    <td colSpan={5} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--retail-muted)' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}><FolderOpen size="1em" className="inline-icon" aria-hidden="true" /></div>
                      <strong>{directoryState === 'loading' ? 'Loading accounts…' : directoryState === 'error' ? 'Could not load accounts.' : 'No accounts match your filters.'}</strong>
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
                          background: isSelected ? 'var(--retail-accent-soft)' : 'var(--retail-card)',
                          cursor: 'pointer',
                          transition: 'background 0.12s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = '#f8fafd';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'var(--retail-card)';
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
                              <strong style={{ color: 'var(--retail-ink)', fontSize: '13.5px', display: 'block', fontWeight: 700 }}>
                                {u.name}
                              </strong>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                <span style={{ color: 'var(--retail-muted)', fontSize: '11.5px' }}>{u.email}</span>
                                <span
                                  style={{
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    background: 'var(--retail-raised)',
                                    color: 'var(--retail-muted)',
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
                                  color: 'var(--retail-ink)',
                                  fontWeight: 600,
                                  background: 'var(--retail-raised)',
                                  padding: '2px 7px',
                                  borderRadius: '5px',
                                  border: '1px solid var(--retail-edge)',
                                }}
                              >
                                {u.assignedLocations[0] || 'Unassigned'}
                                {u.assignedLocations.length > 1 && ` +${u.assignedLocations.length - 1}`}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Column 3: JOINED DATE */}
                        <td style={{ padding: '13px 16px', color: 'var(--retail-muted)', fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                          Joined {u.joinedDate}
                        </td>

                        {/* Column 4: DISCOUNT CAP & PERMISSIONS */}
                        <td style={{ padding: '13px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: '12px',
                                background: u.discountLimitPercent > 0 ? 'var(--retail-accent-soft)' : 'var(--retail-raised)',
                                color: u.discountLimitPercent > 0 ? 'var(--retail-accent-strong)' : 'var(--retail-muted)',
                                border: u.discountLimitPercent > 0 ? '1px solid var(--retail-accent-line)' : '1px solid var(--retail-edge-strong)',
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
                            <small className={u.isActive ? 'admin-active-label' : 'admin-inactive-label'}>{u.isActive ? 'Active' : 'Inactive'}</small>
                          </div>
                        </td>

                        <td style={{ padding: '13px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                            {userActions(u)}
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
        )}

      </div>

      {deactivateUser && <AdminModal isOpen title="Deactivate account?" onClose={() => setDeactivateUser(null)} footer={<>
        <button type="button" className="admin-secondary" onClick={() => setDeactivateUser(null)}>Cancel</button>
        <button type="button" className="admin-primary" onClick={() => { void handleToggleStatus(deactivateUser.id); setDeactivateUser(null); }}>Deactivate account</button>
      </>}>
        <p>{deactivateUser.email} will lose access and existing sign-ins will be revoked.</p>
      </AdminModal>}

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
            role="dialog" aria-modal="true" aria-labelledby="user-form-title"
            style={{
              background: 'var(--retail-card)',
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
                <h2 id="user-form-title" style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--retail-ink)' }}>
                  {editingUser ? 'Edit account' : 'Add user'}
                </h2>
                <small style={{ color: 'var(--retail-muted)' }}>
                  Choose a role and the locations this user can access.
                </small>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: 'var(--retail-muted)', cursor: 'pointer' }}
              >
                <X size="1em" className="inline-icon" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveUser}>
              {formError && <Feedback tone="error">{formError}</Feedback>}
              {formRole !== 'SUPER_ADMIN' && formRole !== 'ADMIN' && (
              <div className="admin-form-grid">
                <div>
                  <label htmlFor="user-name" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Full Name *
                  </label>
                  <input id="user-name"
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Ramesh Verma"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label htmlFor="user-code" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Employee Code *
                  </label>
                  <input id="user-code"
                    type="text"
                    required
                    value={formEmployeeCode}
                    onChange={(e) => setFormEmployeeCode(e.target.value)}
                    placeholder="EMP-0845"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px' }}
                  />
                </div>
              </div>
              )}

              <div className="admin-form-grid">
                <div>
                  <label htmlFor="user-email" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Email Address *
                  </label>
                  <input id="user-email"
                    type="email"
                    required
                    value={formEmail}
                    readOnly={Boolean(editingUser)}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="r.verma@premiumretail.com"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label htmlFor="user-role" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Operational Role *
                  </label>
                  <select id="user-role"
                    value={formRole}
                    onChange={(event) => { setFormRole(event.target.value as ManagedUser['role']); setPermissionOverrides({}); }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px', background: 'var(--retail-card)' }}
                  >
                    <option value="CASHIER">Cashier (POS Lane)</option>
                    <option value="STAFF">Staff (Floor Operations)</option>
                    <option value="INVENTORY">Inventory</option>
                    <option value="STORE_MANAGER">Store Manager (Store Lead)</option>
                    <option value="CENTRAL_MANAGER">Central Manager (Main WH)</option>
                    <option value="SUB_WAREHOUSE_MANAGER">Sub Warehouse Manager (Depot)</option>
                    {currentUserRole === 'SUPER_ADMIN' && (
                      <>
                        <option value="ADMIN">Admin (Scoped Administrator)</option>
                        <option value="SUPER_ADMIN">Super Admin (Global)</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {!editingUser && formRole !== 'SUPER_ADMIN' && <fieldset className="admin-permission-preview">
                <legend>{roleLabels[formRole]} preset</legend>
                {preset ? <>
                  {permissionFields.map(([field, label]) => <label key={field}>
                    <input type="checkbox" checked={permissionOverrides[field] ?? preset[field]} disabled={currentUserRole !== 'SUPER_ADMIN' || savingUser}
                      onChange={(event) => setPermissionOverrides((current) => ({ ...current, [field]: event.target.checked }))} />
                    <span>{label} <small>Default {preset[field] ? 'allowed' : 'off'}</small></span>
                  </label>)}
                  <label>Maximum discount (%)
                    <input type="number" min="0" max="100" step="0.01" value={permissionOverrides.discountLimitPercent ?? preset.discountLimitPercent}
                      disabled={currentUserRole !== 'SUPER_ADMIN' || savingUser} onChange={(event) => {
                        const value = event.target.value;
                        setPermissionOverrides((current) => ({ ...current, discountLimitPercent: value === '' ? undefined : Number(value) }));
                      }} />
                    <small>Default {preset.discountLimitPercent}%</small>
                  </label>
                  {currentUserRole === 'SUPER_ADMIN' && Object.keys(permissionOverrides).length > 0 &&
                    <button type="button" className="admin-secondary" onClick={() => setPermissionOverrides({})}>Reset to preset</button>}
                </> : <p role="status">{presetError || 'Loading role preset…'}</p>}
              </fieldset>}

              {formRole !== 'SUPER_ADMIN' && formRole !== 'ADMIN' && <div className="admin-form-grid">
                <label>Joining date <input className="admin-profile-input" type="date" required value={formHireDate} onChange={(event) => setFormHireDate(event.target.value)} /></label>
                <label>Phone <input className="admin-profile-input" type="tel" maxLength={21} value={formPhone} onChange={(event) => setFormPhone(event.target.value)} /></label>
                <label>Designation <input className="admin-profile-input" maxLength={120} value={formDesignation} onChange={(event) => setFormDesignation(event.target.value)} /></label>
                <label>Monthly base salary <input className="admin-profile-input" type="number" min="0" max="9999999999.99" step="0.01" value={formSalary} onChange={(event) => setFormSalary(event.target.value)} /></label>
                <label>Address <input className="admin-profile-input" maxLength={400} value={formAddress} onChange={(event) => setFormAddress(event.target.value)} /></label>
              </div>}

              {!editingUser && (
                <div style={{ marginBottom: '14px' }}>
                  <label htmlFor="user-password" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Initial Password
                  </label>
                  <input id="user-password"
                    aria-describedby="password-length"
                    autoComplete="new-password"
                    type="password"
                    required
                    minLength={12}
                    placeholder="At least 12 characters"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px' }}
                  />
                  <small id="password-length" className={formPassword.length >= 12 ? 'admin-active-label' : 'admin-inactive-label'}>
                    {formPassword.length >= 12 ? '✓ 12-character minimum met' : `${formPassword.length} of 12 characters`}
                  </small>
                </div>
              )}

              {/* Physical Location Binding */}
              {formRole !== 'SUPER_ADMIN' && (
              <div style={{ marginBottom: '16px', padding: '12px', background: 'var(--retail-raised)', borderRadius: '8px', border: '1px solid var(--retail-edge)' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '8px' }}>
                  Assigned locations *
                </label>
                {availableLocations.length === 0 && <Feedback tone="info" action={<Link href="/admin/company">Manage locations</Link>}>
                  Create or reactivate a location before adding a user with this role.
                </Feedback>}
                {!!availableLocations.length && <>
                  <input type="search" className="admin-location-search" aria-label="Search assigned locations" placeholder="Search locations by name"
                    value={locationSearch} onChange={(e) => setLocationSearch(e.target.value)} />
                  <div className="admin-location-selection" aria-label="Selected locations">
                    {formLocations.length ? formLocations.map((id) => {
                      const name = availableLocations.find((location) => location.id === id)?.name ?? 'Inactive location';
                      return <button type="button" key={id} className="admin-secondary"
                        aria-label={`Remove ${name}`} onClick={() => handleToggleLocation(id)}>{name} <X size={14} /></button>;
                    })
                      : <small>No locations selected</small>}
                  </div>
                  {!!locationSearch.trim() && <div className="admin-location-results">
                    {availableLocations.filter(({ name }) => name.toLowerCase().includes(locationSearch.trim().toLowerCase())).map(({ id, name }) =>
                      <label key={id}><input type="checkbox" checked={formLocations.includes(id)} onChange={() => handleToggleLocation(id)} />{name}</label>)}
                    {!availableLocations.some(({ name }) => name.toLowerCase().includes(locationSearch.trim().toLowerCase())) && <small>No matching locations</small>}
                  </div>}
                </>}

              </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--retail-edge-strong)',
                    background: 'var(--retail-card)',
                    color: 'var(--retail-muted)',
                    fontSize: '13px',
                    fontWeight: 650,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    background: 'var(--retail-accent)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {savingUser ? 'Saving…' : editingUser ? 'Save changes' : 'Create user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
