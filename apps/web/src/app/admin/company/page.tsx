'use client';

import {
  Building2,
  Check,
  ChevronDown,
  Ellipsis,
  Landmark,
  Link2,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Settings,
  Store,
  TriangleAlert,
  Warehouse,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import { Feedback } from '@/components/ui/feedback';
import Link from 'next/link';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export interface LocationNode {
  id: string;
  code: string;
  name: string;
  type: 'CENTRAL_WAREHOUSE' | 'SUB_WAREHOUSE' | 'RETAIL_STORE';
  parentId: string | null;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
  assignedManager: string;
  isActive: boolean;
  address: string;
  managerId?: string | null;
}

type ManagerOption = {
  id: string;
  email: string;
  role: 'CENTRAL_MANAGER' | 'SUB_WAREHOUSE_MANAGER' | 'STORE_MANAGER';
  locationIds: string[];
};

const TYPE_OPTIONS = [
  { value: 'ALL', label: 'All Facility Types' },
  { value: 'RETAIL_STORE', label: 'Retail Outlets (POS)' },
  { value: 'CENTRAL_WAREHOUSE', label: 'Central Warehouses' },
  { value: 'SUB_WAREHOUSE', label: 'Regional Sub-Warehouses' },
];

const typeLabels: Record<string, string> = {
  ALL: 'All Facility Types',
  RETAIL_STORE: 'Retail Outlets',
  CENTRAL_WAREHOUSE: 'Central Hubs',
  SUB_WAREHOUSE: 'Regional Depots',
};

export default function CompanySettingsPage() {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'NETWORK' | 'PROFILE'>('NETWORK');

  // Company Profile State
  const [companyName, setCompanyName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [requireCheckoutDrawer, setRequireCheckoutDrawer] = useState(true);
  const [cashSettlementFrequency, setCashSettlementFrequency] = useState('daily');
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [profileState, setProfileState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [needsProfile, setNeedsProfile] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [saving, setSaving] = useState(false);

  // Hierarchy State
  const [nodes, setNodes] = useState<LocationNode[]>([]);
  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
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
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [openDropdown, setOpenDropdown] = useState<'TYPE' | 'STATUS' | null>(null);
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<{ top: number; right: number } | null>(null);

  // Selected Node Form State
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];
  const [nodeName, setNodeName] = useState(selectedNode?.name || '');
  const [nodeType, setNodeType] = useState<LocationNode['type']>(selectedNode?.type || 'RETAIL_STORE');
  const [nodeParent, setNodeParent] = useState(selectedNode?.parentId || '');
  const [nodeManager, setNodeManager] = useState(selectedNode?.managerId || '');
  const [nodeAddress, setNodeAddress] = useState(selectedNode?.address || '');

  // Add Node Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<LocationNode['type']>('RETAIL_STORE');
  const [newParent, setNewParent] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newManagerId, setNewManagerId] = useState('');
  const [managerAssignmentFilter, setManagerAssignmentFilter] = useState<'UNASSIGNED' | 'ASSIGNED' | 'ALL'>('UNASSIGNED');
  const [managerRoleFilter, setManagerRoleFilter] = useState<'ALL' | ManagerOption['role']>('ALL');

  useEffect(() => {
    const token = getStoredSession()?.accessToken;
    if (!token) return;
    if (new URLSearchParams(window.location.search).get('tab') === 'profile') setActiveTab('PROFILE');
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_BASE}/companies`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE}/locations`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE}/users?isActive=true`, { headers, cache: 'no-store' }),
    ]).then(async ([companiesResponse, locationsResponse, usersResponse]) => {
      if (!companiesResponse.ok || !locationsResponse.ok || !usersResponse.ok) throw new Error('Could not load company, location, and manager records.');
      const [companiesPayload, locationsPayload, usersPayload] = await Promise.all([companiesResponse.json(), locationsResponse.json(), usersResponse.json()]);
      const managers: ManagerOption[] = (usersPayload.data || [])
        .filter((user: any) => ['CENTRAL_MANAGER', 'SUB_WAREHOUSE_MANAGER', 'STORE_MANAGER'].includes(user.role))
        .map((user: any) => ({ id: user.id, email: user.email, role: user.role, locationIds: (user.locationScopes || []).map((scope: any) => scope.locationId) }));
      (locationsPayload.data || []).forEach((location: any) => {
        if (!location.managerId) return;
        const manager = managers.find((candidate) => candidate.id === location.managerId);
        if (manager && !manager.locationIds.includes(location.id)) manager.locationIds.push(location.id);
      });
      setManagerOptions(managers);
      const managerById = new Map(managers.map((manager) => [manager.id, manager]));
      const company = companiesPayload.data?.[0];
      if (company) {
        setCompanyId(company.id);
        setCompanyName(company.name || '');
        setCurrency(company.currency || 'INR');
        setTimezone(company.timezone || 'Asia/Kolkata');
        setInvoicePrefix(company.invoicePrefix || '');
        setCashSettlementFrequency(company.cashSettlementFrequency ?? 'daily');
        setRequireCheckoutDrawer(company.requireCheckoutDrawer ?? true);
      }
      const mapped: LocationNode[] = (locationsPayload.data || []).map((loc: any) => ({
        id: loc.id, code: loc.code || loc.id.slice(0, 8).toUpperCase(), name: loc.name,
        type: loc.type === 'MAIN_WAREHOUSE' ? 'CENTRAL_WAREHOUSE' : loc.type,
        parentId: loc.parentId || null, latitude: Number(loc.latitude || 0), longitude: Number(loc.longitude || 0),
        geofenceRadiusMeters: Number(loc.geofenceRadius || 0), managerId: loc.managerId || null,
        assignedManager: managerById.get(loc.managerId)?.email || '',
        isActive: Boolean(loc.isActive), address: loc.address || '',
      }));
      setNodes(mapped);
      if (mapped[0]) setSelectedNodeId(mapped[0].id);
      setProfileState('ready');
    }).catch((error) => {
      setProfileState('error');
      setNotice(error instanceof Error ? error.message : 'Could not load company data.');
    });
  }, []);

  // Edit Node Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    if (selectedNode) {
      setNodeName(selectedNode.name);
      setNodeType(selectedNode.type);
      setNodeParent(selectedNode.parentId || '');
      setNodeManager(selectedNode.managerId || '');
      setNodeAddress(selectedNode.address);
    }
  }, [selectedNodeId]);

  useEffect(() => {
    // Close open menus on outside click
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.custom-filter-dropdown-wrap')) {
        setOpenDropdown(null);
      }
      if (!target.closest('.node-action-menu-wrap')) {
        setActiveActionMenuId(null);
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    if (!activeActionMenuId) return;
    const closeMenu = () => {
      setActiveActionMenuId(null);
      setActionMenuPosition(null);
    };
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [activeActionMenuId]);

  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      const matchSearch =
        !search.trim() ||
        n.name.toLowerCase().includes(search.toLowerCase()) ||
        n.code.toLowerCase().includes(search.toLowerCase()) ||
        n.address.toLowerCase().includes(search.toLowerCase()) ||
        n.assignedManager.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === 'ALL' || n.type === typeFilter;
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && n.isActive) ||
        (statusFilter === 'INACTIVE' && !n.isActive);

      return matchSearch && matchType && matchStatus;
    });
  }, [nodes, search, typeFilter, statusFilter]);

  const kpis = useMemo(() => {
    const total = nodes.length;
    const stores = nodes.filter((n) => n.type === 'RETAIL_STORE').length;
    const central = nodes.filter((n) => n.type === 'CENTRAL_WAREHOUSE').length;
    const sub = nodes.filter((n) => n.type === 'SUB_WAREHOUSE').length;
    return { total, stores, central, sub };
  }, [nodes]);

  const filteredManagerOptions = managerOptions.filter((manager) =>
    (managerRoleFilter === 'ALL' || manager.role === managerRoleFilter) &&
    (managerAssignmentFilter === 'ALL' ||
      (managerAssignmentFilter === 'UNASSIGNED' && manager.locationIds.length === 0) ||
      (managerAssignmentFilter === 'ASSIGNED' && manager.locationIds.length > 0))
  );

  const handleSaveCompany = async (e: FormEvent) => {
    e.preventDefault();
    if (!invoicePrefix.trim() || invoicePrefix.length < 2) {
      setNotice('Invoice prefix must be at least 2 characters.', 'error');
      return;
    }
    const token = getStoredSession()?.accessToken;
    if (!token) return setNotice('Sign in again to save company settings.');
    setSaving(true);
    try {
      const response = await fetch(companyId ? `${API_BASE}/companies/${companyId}` : `${API_BASE}/companies`, {
        method: companyId ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: companyName.trim(), currency, timezone, cashSettlementFrequency, requireCheckoutDrawer, invoicePrefix: invoicePrefix.trim().toUpperCase() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Company settings could not be saved.');
      if (payload.data?.id) setCompanyId(payload.data.id);
      setNeedsProfile(false);
      setNotice(companyId ? 'Company settings saved.' : 'Company created. You can now add locations.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Company settings could not be saved.');
    } finally { setSaving(false); }
  };

  const handleSaveNode = async (e: FormEvent) => {
    e.preventDefault();
    if (!nodeName.trim()) {
      setNotice('Location name is required.', 'error');
      return;
    }
    if (!selectedNode) return setNotice('Select a location to edit.', 'error');
    const token = getStoredSession()?.accessToken;
    if (!token) {
      setIsEditModalOpen(false);
      return setNotice('Sign in again to save location changes.', 'error');
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/locations/${selectedNode.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nodeName.trim(),
          type: nodeType === 'CENTRAL_WAREHOUSE' ? 'MAIN_WAREHOUSE' : nodeType,
          parentId: nodeParent || null,
          address: nodeAddress.trim() || undefined,
          managerId: nodeManager || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Location could not be updated.');
      const saved = payload.data;
      const manager = managerOptions.find((option) => option.id === nodeManager);
      setNodes((current) => current.map((node) => node.id === saved.id ? {
        ...node,
        name: saved.name,
        type: saved.type === 'MAIN_WAREHOUSE' ? 'CENTRAL_WAREHOUSE' : saved.type,
        parentId: saved.parentId || null,
        address: saved.address || '',
        latitude: Number(saved.latitude || 0),
        longitude: Number(saved.longitude || 0),
        geofenceRadiusMeters: Number(saved.geofenceRadius || 0),
        managerId: saved.managerId || null,
        assignedManager: manager?.email || '',
      } : node));
      if (manager) setManagerOptions((current) => current.map((option) => option.id === manager.id ? { ...option, locationIds: [...new Set([...option.locationIds, saved.id])] } : option));
      setIsEditModalOpen(false);
      setNotice(`Location "${saved.name}" updated.`);
    } catch (error) {
      setIsEditModalOpen(false);
      setNotice(error instanceof Error ? error.message : 'Location could not be updated.', 'error');
    } finally {
      setSaving(false);
    }
  };

  function openAddLocation() {
    setNotice(null);
    if (profileState !== 'ready') {
      setNotice('Company data could not be verified. Reload the page before adding a location.', 'error');
      return;
    }
    if (!companyId) {
      setNeedsProfile(true);
      return;
    }
    setLocationError('');
    setIsAddModalOpen(true);
  }

  const handleAddNode = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setLocationError('Enter a location name.');
      return;
    }

    if (newType !== 'CENTRAL_WAREHOUSE' && !newParent) {
      setLocationError('Choose a parent warehouse for this location.');
      return;
    }

    const token = getStoredSession()?.accessToken;
    if (!token) {
      setIsAddModalOpen(false);
      return setNotice('Sign in again to create a location.');
    }
    if (!companyId) {
      setIsAddModalOpen(false);
      return setNeedsProfile(true);
    }
    setLocationError('');
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/locations`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, name: newName.trim(), type: newType === 'CENTRAL_WAREHOUSE' ? 'MAIN_WAREHOUSE' : newType, address: newAddress.trim() || undefined, parentId: newParent || undefined, managerId: newManagerId || undefined }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Location could not be created.');
      const loc = payload.data;
      const manager = managerOptions.find((option) => option.id === newManagerId);
      const node: LocationNode = { id: loc.id, code: loc.code || loc.id.slice(0, 8).toUpperCase(), name: loc.name, type: loc.type === 'MAIN_WAREHOUSE' ? 'CENTRAL_WAREHOUSE' : loc.type, parentId: loc.parentId || null, latitude: Number(loc.latitude || 0), longitude: Number(loc.longitude || 0), geofenceRadiusMeters: Number(loc.geofenceRadius || 0), assignedManager: manager?.email || '', managerId: loc.managerId || null, isActive: Boolean(loc.isActive), address: loc.address || '' };
      setNodes((prev) => [...prev, node]);
      if (manager) setManagerOptions((prev) => prev.map((option) => option.id === manager.id ? { ...option, locationIds: [...new Set([...option.locationIds, node.id])] } : option));
      setSelectedNodeId(node.id); setIsAddModalOpen(false); setNewName(''); setNewAddress(''); setNewManagerId(''); setNotice(`Location "${node.name}" created.`);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : 'Location could not be created.');
    }
    finally { setSaving(false); }
  };

  const handleToggleNodeStatus = async (nodeId: string) => {
    const node = nodes.find((location) => location.id === nodeId);
    if (!node) return;
    const token = getStoredSession()?.accessToken;
    if (!token) return setNotice(`Sign in again to ${node.isActive ? 'deactivate' : 'reactivate'} this location.`, 'error');
    try {
      const nextActive = !node.isActive;
      const response = await fetch(`${API_BASE}/locations/${nodeId}/${nextActive ? 'reactivate' : 'deactivate'}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || `Location could not be ${nextActive ? 'reactivated' : 'deactivated'}.`);
      setNodes((prev) => prev.map((entry) => entry.id === nodeId ? { ...entry, isActive: nextActive } : entry));
      setNotice(`Location ${node.name} ${nextActive ? 'reactivated' : 'deactivated'}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Location could not be deactivated.'); }
  };

  const copyLocationInfo = (n: LocationNode) => {
    const text = `Facility: ${n.name} (${n.code}) | Type: ${n.type} | Address: ${n.address}`;
    navigator.clipboard.writeText(text);
    setNotice(`Coordinates & details for ${n.name} copied to clipboard!`);
  };

  const getNodeBadge = (type: LocationNode['type']) => {
    switch (type) {
      case 'CENTRAL_WAREHOUSE':
        return {
          icon: <Building2 size={13} aria-hidden="true" />,
          label: 'Central Hub',
          bg: 'var(--retail-accent-soft)',
          color: '#1d4ed8',
          border: 'var(--retail-accent-line)',
        };
      case 'SUB_WAREHOUSE':
        return {
          icon: <Warehouse size={13} aria-hidden="true" />,
          label: 'Regional Depot',
          bg: '#f3e8fd',
          color: '#7e22ce',
          border: '#e9d5ff',
        };
      case 'RETAIL_STORE':
      default:
        return {
          icon: <Store size={13} aria-hidden="true" />,
          label: 'Retail Store',
          bg: '#ecfdf5',
          color: '#047857',
          border: '#a7f3d0',
        };
    }
  };

  return (
    <div className="app-page admin-workspace" style={{ color: 'var(--retail-ink)' }}>
      {notice && <Feedback toast tone={notice.type} onDismiss={() => setNotice(null)}>{notice.message}</Feedback>}
      {needsProfile && <Feedback toast tone="error" onDismiss={() => setNeedsProfile(false)} action={
        <Link href="/admin/company?tab=profile" onClick={() => { setActiveTab('PROFILE'); setNeedsProfile(false); }}>Complete company profile</Link>
      }>Create your company profile before adding a location.</Feedback>}

      <header className="admin-page-header">
        <div>
          <h1>Company &amp; Locations</h1>
          <p>Manage stores, warehouses, and company billing details.</p>
        </div>
        <div className="admin-heading-actions">
          <div className="admin-view-switch" role="group" aria-label="Company section">
            <button type="button" aria-pressed={activeTab === 'NETWORK'} onClick={() => { setActiveTab('NETWORK'); window.history.replaceState(null, '', '/admin/company'); }}>Locations</button>
            <button type="button" aria-pressed={activeTab === 'PROFILE'} onClick={() => setActiveTab('PROFILE')}>Company profile</button>
          </div>
          <button type="button" className="admin-primary" disabled={profileState === 'loading'} onClick={openAddLocation}>
            <Plus size={16} aria-hidden="true" /> Add location
          </button>
        </div>
      </header>

      {activeTab === 'NETWORK' && <section className="company-network" aria-labelledby="network-overview">
        <div className="company-network-heading">
          <div><h2 id="network-overview">Network overview</h2><p>Filter the directory by location type.</p></div>
          <button type="button" className="admin-secondary" onClick={() => { setTypeFilter('ALL'); setStatusFilter('ALL'); setSearch(''); }}>All locations · {profileState === 'ready' ? kpis.total : '—'}</button>
        </div>
        <div className="company-network-grid">
          {([
            ['RETAIL_STORE', 'Retail stores', kpis.stores, Store],
            ['CENTRAL_WAREHOUSE', 'Central warehouses', kpis.central, Warehouse],
            ['SUB_WAREHOUSE', 'Sub-warehouses', kpis.sub, Building2],
          ] as const).map(([type, label, count, Icon]) => <button
            key={type} type="button" className="company-network-metric" aria-pressed={typeFilter === type}
            onClick={() => setTypeFilter(typeFilter === type ? 'ALL' : type)}>
            <span><Icon size={18} aria-hidden="true" /> {label}</span>
            <strong>{profileState === 'ready' ? count : '—'}</strong>
          </button>)}
          <button type="button" className="company-network-metric company-network-profile" onClick={() => setActiveTab('PROFILE')}>
            <span><Landmark size={18} aria-hidden="true" /> Company profile</span>
            <strong>{profileState === 'loading' ? 'Loading…' : profileState === 'error' ? 'Unavailable' : companyId ? 'Complete' : 'Setup needed'}</strong>
            {profileState === 'ready' && companyId && <small>{currency} · Invoice prefix {invoicePrefix || 'pending'}</small>}
          </button>
        </div>
      </section>}

      {/* VIEW TAB 1: PHYSICAL TOPOLOGY & FACILITIES DIRECTORY */}
      {activeTab === 'NETWORK' && (
        <div>
          {/* Filter Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--retail-muted)', textTransform: 'uppercase', margin: 0 }}>
              Location directory ({filteredNodes.length})
            </h2>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              {/* Search input */}
              <input
                type="text"
                placeholder="Search facility by name, code, address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '18px',
                  border: '1px solid var(--retail-edge-strong)',
                  fontSize: '12.5px',
                  outline: 'none',
                  background: 'var(--retail-raised)',
                  minWidth: '240px',
                }}
              />

              {/* Custom Styled Type Dropdown */}
              <div className="custom-filter-dropdown-wrap" style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setOpenDropdown(openDropdown === 'TYPE' ? null : 'TYPE')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    borderRadius: '20px',
                    border: typeFilter !== 'ALL' ? '1px solid #93c5fd' : '1px solid var(--retail-edge-strong)',
                    background: typeFilter !== 'ALL' ? 'var(--retail-accent-soft)' : 'var(--retail-card)',
                    color: typeFilter !== 'ALL' ? '#1d4ed8' : 'var(--retail-ink)',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span><Building2 size="1em" className="inline-icon" aria-hidden="true" /></span>
                  <span>{typeLabels[typeFilter] || 'All Facility Types'}</span>
                  <span style={{ fontSize: '9px', color: 'var(--retail-subtle)', marginLeft: '2px' }}><ChevronDown size="1em" className="inline-icon" aria-hidden="true" /></span>
                </button>

                {openDropdown === 'TYPE' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      width: '220px',
                      background: 'var(--retail-card)',
                      borderRadius: '12px',
                      border: '1px solid var(--retail-edge)',
                      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
                      padding: '6px',
                      zIndex: 60,
                    }}
                  >
                    <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 800, color: 'var(--retail-subtle)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      FILTER BY TYPE
                    </div>
                    {TYPE_OPTIONS.map((opt) => {
                      const isSelected = typeFilter === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setTypeFilter(opt.value);
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
                      FACILITY STATUS
                    </div>
                    {[
                      { value: 'ALL', label: 'All Statuses', dot: 'var(--retail-muted)' },
                      { value: 'ACTIVE', label: 'Active Facilities', dot: '#16a34a' },
                      { value: 'INACTIVE', label: 'Archived / Inactive', dot: 'var(--retail-subtle)' },
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

              {(search || typeFilter !== 'ALL' || statusFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setTypeFilter('ALL');
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

          {/* Table Container */}
          <div
            style={{
              background: 'var(--retail-card)',
              border: '1px solid var(--retail-edge)',
              borderRadius: '14px',
              overflow: 'hidden',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '740px', tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
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
                    <th style={{ padding: '14px 20px', width: '35%' }}>FACILITY IDENTITY</th>
                    <th style={{ padding: '14px 16px', width: '20%' }}>TYPE & HIERARCHY</th>
                    <th style={{ padding: '14px 16px', width: '25%' }}>FACILITY MANAGER</th>
                    <th style={{ padding: '14px 20px', width: '20%', textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNodes.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--retail-muted)' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}><Building2 size="1em" className="inline-icon" aria-hidden="true" /></div>
                        <strong>{profileState === 'loading' ? 'Loading locations…' : profileState === 'error' ? 'Could not load locations' : nodes.length ? 'No locations match these filters' : 'No locations yet'}</strong>
                        <p style={{ margin: '4px 0 0', fontSize: '12px' }}>{profileState === 'ready' && (nodes.length ? 'Try changing the search or filters.' : companyId ? 'Add a store or warehouse to get started.' : 'Complete the company profile to add your first location.')}</p>
                      </td>
                    </tr>
                  ) : (
                    filteredNodes.map((n) => {
                      const badge = getNodeBadge(n.type);
                      const isSelected = selectedNodeId === n.id;
                      const parent = nodes.find((p) => p.id === n.parentId);
                      const initials = n.assignedManager.slice(0, 2).toUpperCase();

                      return (
                        <tr
                          key={n.id}
                          onClick={() => setSelectedNodeId(n.id)}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: isSelected ? 'var(--retail-accent-soft)' : 'var(--retail-card)',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease',
                            opacity: n.isActive ? 1 : 0.65,
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = '#f8fafd';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'var(--retail-card)';
                          }}
                        >
                          {/* Col 1: FACILITY IDENTITY */}
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
                                  fontSize: '16px',
                                  flexShrink: 0,
                                }}
                              >
                                {badge.icon}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <strong style={{ color: 'var(--retail-ink)', fontSize: '13.5px', display: 'block', fontWeight: 700 }}>
                                  {n.name}
                                </strong>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                  <span
                                    style={{
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      background: 'var(--retail-raised)',
                                      color: 'var(--retail-muted)',
                                      fontSize: '11px',
                                      fontFamily: 'monospace',
                                      fontWeight: 700,
                                    }}
                                  >
                                    {n.code}
                                  </span>
                                  <span style={{ color: 'var(--retail-muted)', fontSize: '11.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
                                    {n.address}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Col 2: TYPE & HIERARCHY */}
                          <td style={{ padding: '13px 16px' }}>
                            <div>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '3px 8px',
                                  borderRadius: '12px',
                                  background: badge.bg,
                                  color: badge.color,
                                  border: `1px solid ${badge.border}`,
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                }}
                              >
                                {badge.label}
                              </span>
                              <small style={{ display: 'block', fontSize: '11px', color: 'var(--retail-muted)', marginTop: '3px' }}>
                                {parent ? `Parent: ${parent.name}` : 'Enterprise Root'}
                              </small>
                            </div>
                          </td>

                          {/* Col 3: FACILITY MANAGER */}
                          <td style={{ padding: '13px 16px' }}>
                            {n.assignedManager ? (
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
                              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--retail-ink)' }}>
                                {n.assignedManager.split('(')[0].trim()}
                              </span>
                            </div>
                            ) : (
                              <button type="button" className="admin-secondary manager-missing" onClick={() => { setSelectedNodeId(n.id); setIsEditModalOpen(true); }}>
                                <TriangleAlert size={15} aria-hidden="true" /> Assign manager
                              </button>
                            )}
                          </td>

                          {/* Col 5: ACTIONS */}
                          <td style={{ padding: '13px 20px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyLocationInfo(n);
                                }}
                                style={{
                                  width: '30px',
                                  height: '30px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: 'transparent',
                                  color: 'var(--retail-muted)',
                                  fontSize: '15px',
                                  cursor: 'pointer',
                                  display: 'grid',
                                  placeItems: 'center',
                                }}
                                title="Copy location details"
                              >
                                <Link2 size="1em" className="inline-icon" aria-hidden="true" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedNodeId(n.id);
                                  setIsEditModalOpen(true);
                                }}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--retail-edge-strong)',
                                  background: 'var(--retail-card)',
                                  color: 'var(--retail-ink)',
                                  fontSize: '11px',
                                  fontWeight: 650,
                                  cursor: 'pointer',
                                }}
                                title="Configure Node"
                              >
                                Configure
                              </button>

                              <div className="node-action-menu-wrap" style={{ position: 'relative' }}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (activeActionMenuId === n.id) {
                                      setActiveActionMenuId(null);
                                      setActionMenuPosition(null);
                                      return;
                                    }
                                    const buttonRect = e.currentTarget.getBoundingClientRect();
                                    const menuHeight = 82;
                                    setActionMenuPosition({
                                      top: Math.max(8, Math.min(buttonRect.bottom + 4, window.innerHeight - menuHeight - 8)),
                                      right: Math.max(8, window.innerWidth - buttonRect.right),
                                    });
                                    setActiveActionMenuId(n.id);
                                  }}
                                  style={{
                                    width: '30px',
                                    height: '30px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: 'var(--retail-muted)',
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

                                {activeActionMenuId === n.id && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                      position: 'fixed',
                                      right: actionMenuPosition?.right ?? 8,
                                      top: actionMenuPosition?.top ?? 8,
                                      background: 'var(--retail-card)',
                                      borderRadius: '10px',
                                      border: '1px solid var(--retail-edge)',
                                      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.12)',
                                      zIndex: 1000,
                                      width: 'min(200px, calc(100vw - 16px))',
                                      padding: '6px',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveActionMenuId(null);
                                        setSelectedNodeId(n.id);
                                        setIsEditModalOpen(true);
                                      }}
                                      style={{
                                        width: '100%',
                                        padding: '8px 10px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--retail-ink)',
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                      }}
                                    >
                                      <span><Pencil size="1em" className="inline-icon" aria-hidden="true" /></span> Edit Facility
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveActionMenuId(null);
                                        handleToggleNodeStatus(n.id);
                                      }}
                                      style={{
                                        width: '100%',
                                        padding: '8px 10px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: 'transparent',
                                        color: n.isActive ? '#dc2626' : '#16a34a',
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                      }}
                                    >
                                      <span>{n.isActive ? <X size="1em" className="inline-icon" aria-hidden="true" /> : <Check size="1em" className="inline-icon" aria-hidden="true" />}</span> {n.isActive ? 'Deactivate Node' : 'Reactivate Node'}
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

          {/* Immutable Ledger Footnote */}
          <div
            style={{
              marginTop: '18px',
              padding: '12px 16px',
              background: 'var(--retail-raised)',
              border: '1px solid var(--retail-edge)',
              borderRadius: '10px',
              fontSize: '11.5px',
              color: 'var(--retail-muted)',
              lineHeight: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '16px' }}><Lock size="1em" className="inline-icon" aria-hidden="true" /></span>
            <span>
              <strong>Dual-Axis Invariant 8 Enforced:</strong> Physical location nodes with historical transactions, in-transit transfers, or stock counts can never be purged. Inactive facilities are permanently archived for auditing continuity.
            </span>
          </div>
        </div>
      )}

      {/* VIEW TAB 2: CORPORATE PROFILE & BILLING PARAMETERS */}
      {activeTab === 'PROFILE' && (
        <div
          style={{
            background: 'var(--retail-card)',
            border: '1px solid var(--retail-edge)',
            borderRadius: '14px',
            padding: '28px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '22px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
            <span style={{ fontSize: '24px' }}><Landmark size="1em" className="inline-icon" aria-hidden="true" /></span>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--retail-ink)' }}>
                Company profile
              </h2>
              <small style={{ color: 'var(--retail-muted)' }}>
                Set the company name, currency, time zone, and invoice prefix.
              </small>
            </div>
          </div>

          <form onSubmit={handleSaveCompany}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '6px' }}>
                  Legal Company Entity Name *
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '6px' }}>
                  Base Currency *
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px', background: 'var(--retail-card)' }}
                >
                  <option value="INR">INR - Indian Rupee (₹)</option>
                  <option value="USD">USD - US Dollar ($)</option>
                  <option value="EUR">EUR - Euro (€)</option>
                  <option value="AED">AED - UAE Dirham (د.إ)</option>
                  <option value="GBP">GBP - British Pound (£)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '6px' }}>
                  Operating Timezone *
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px', background: 'var(--retail-card)' }}
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (UTC +05:30 - Standard)</option>
                  <option value="Asia/Dubai">Asia/Dubai (UTC +04:00)</option>
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                  <option value="America/New_York">America/New_York (EST / EDT)</option>
                  <option value="Europe/London">Europe/London (GMT / BST)</option>
                </select>
              </div>

              <div>
                <label htmlFor="settlement-frequency">Cash settlement reporting frequency</label>
                <select id="settlement-frequency" className="admin-profile-input" value={cashSettlementFrequency} onChange={(event) => setCashSettlementFrequency(event.target.value)}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <small>Groups closed drawers in Reports. Staff still count and close their own drawers.</small>
                <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
                  <input type="checkbox" checked={requireCheckoutDrawer} onChange={(event) => setRequireCheckoutDrawer(event.target.checked)} />
                  Require an open drawer at checkout
                </label>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '6px' }}>
                  Global Unique Invoice Prefix *
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={invoicePrefix}
                  onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--retail-edge-strong)',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    color: 'var(--retail-accent-strong)',
                  }}
                />
                <small style={{ color: 'var(--retail-muted)', fontSize: '11.5px', marginTop: '3px', display: 'block' }}>
                  Generates invoices as <code>{invoicePrefix || 'INV'}-00000001</code>.
                </small>
              </div>

            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="submit"
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  background: 'var(--retail-accent)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(26, 98, 234, 0.28)',
                }}
              >
                Save Corporate Settings
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CONFIGURE / EDIT NODE MODAL */}
      {isEditModalOpen && (
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
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--retail-ink)' }}>
                  Configure location
                </h2>
                <small style={{ color: 'var(--retail-muted)' }}>
                  Edit the address, warehouse relationship, or manager.
                </small>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: 'var(--retail-muted)', cursor: 'pointer' }}
              >
                <X size="1em" className="inline-icon" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSaveNode}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 168px), 1fr))', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Facility Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={nodeName}
                    onChange={(e) => setNodeName(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    System Location ID
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={selectedNode?.code || ''}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', background: 'var(--retail-raised)', color: 'var(--retail-muted)', fontSize: '13px', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 168px), 1fr))', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Facility Type *
                  </label>
                  <select
                    value={nodeType}
                    onChange={(e) => {
                      const nextType = e.target.value as LocationNode['type'];
                      setNodeType(nextType);
                      if (nextType === 'CENTRAL_WAREHOUSE') setNodeParent('');
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px', background: 'var(--retail-card)' }}
                  >
                    <option value="RETAIL_STORE">Retail store</option>
                    <option value="SUB_WAREHOUSE">Sub-warehouse</option>
                    <option value="CENTRAL_WAREHOUSE">Central warehouse</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Parent warehouse
                  </label>
                  <select
                    value={nodeParent}
                    required={nodeType !== 'CENTRAL_WAREHOUSE'}
                    disabled={nodeType === 'CENTRAL_WAREHOUSE'}
                    onChange={(e) => setNodeParent(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px', background: 'var(--retail-card)' }}
                  >
                    <option value="">{nodeType === 'CENTRAL_WAREHOUSE' ? 'No parent required' : 'Select a parent warehouse'}</option>
                    {nodes
                      .filter((n) => n.id !== selectedNodeId && n.isActive && (nodeType === 'SUB_WAREHOUSE'
                        ? n.type === 'CENTRAL_WAREHOUSE'
                        : n.type === 'CENTRAL_WAREHOUSE' || n.type === 'SUB_WAREHOUSE'))
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} ({n.code})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                  Address *
                </label>
                <input
                  type="text"
                  required
                  value={nodeAddress}
                  onChange={(e) => setNodeAddress(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                  Assigned Manager
                </label>
                <select
                  value={nodeManager}
                  onChange={(e) => setNodeManager(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px', background: 'var(--retail-card)' }}
                >
                  <option value="">No manager assigned</option>
                  {managerOptions.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.email} · {manager.role.replaceAll('_', ' ')} · {manager.locationIds.length ? `Assigned (${manager.locationIds.length} locations)` : 'Unassigned'}
                    </option>
                  ))}
                </select>
              </div>

              <p style={{ margin: '0 0 20px', color: 'var(--retail-muted)', fontSize: '12px' }}>
                Facility status: {selectedNode?.isActive ? 'Active' : 'Inactive'}. Change status from the facility actions menu.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--retail-edge-strong)', background: 'var(--retail-card)', color: 'var(--retail-muted)', fontSize: '13px', fontWeight: 650, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 20px', borderRadius: '8px', background: 'var(--retail-accent)', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Save Facility Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROVISION NEW NODE MODAL */}
      {isAddModalOpen && (
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
              background: 'var(--retail-card)',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '28px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--retail-ink)' }}>
                  Provision New Location Node
                </h2>
                <small style={{ color: 'var(--retail-muted)' }}>Add a warehouse or retail store to company topology.</small>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: 'var(--retail-muted)', cursor: 'pointer' }}
              >
                <X size="1em" className="inline-icon" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleAddNode}>
              {locationError && <Feedback tone="error">{locationError}</Feedback>}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                  Location Facility Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. South Bay Retail Outlet"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px' }}
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Facility Type *
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => {
                      const nextType = e.target.value as LocationNode['type'];
                      setNewType(nextType);
                      if (nextType === 'CENTRAL_WAREHOUSE') setNewParent('');
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px', background: 'var(--retail-card)' }}
                  >
                    <option value="RETAIL_STORE">Retail store</option>
                    <option value="SUB_WAREHOUSE">Sub-warehouse</option>
                    <option value="CENTRAL_WAREHOUSE">Central warehouse</option>
                  </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 168px), 1fr))', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Parent warehouse{newType === 'CENTRAL_WAREHOUSE' ? '' : ' *'}
                  </label>
                  <select
                    value={newParent}
                    required={newType !== 'CENTRAL_WAREHOUSE'}
                    disabled={newType === 'CENTRAL_WAREHOUSE'}
                    onChange={(e) => setNewParent(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px', background: 'var(--retail-card)' }}
                  >
                    <option value="">{newType === 'CENTRAL_WAREHOUSE' ? 'No parent required' : 'Select a parent warehouse'}</option>
                    {nodes.filter((n) => n.isActive && (newType === 'SUB_WAREHOUSE'
                      ? n.type === 'CENTRAL_WAREHOUSE'
                      : n.type === 'CENTRAL_WAREHOUSE' || n.type === 'SUB_WAREHOUSE')).map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.code})
                      </option>
                    ))}
                  </select>
                  {newType !== 'CENTRAL_WAREHOUSE' && <p style={{ margin: '5px 0 0', color: 'var(--retail-muted)', fontSize: '12px' }}>
                    {nodes.some((node) => node.isActive && (node.type === 'CENTRAL_WAREHOUSE' || (newType === 'RETAIL_STORE' && node.type === 'SUB_WAREHOUSE')))
                      ? 'Select the warehouse that supplies this location.'
                      : 'Create an active central warehouse before adding this location.'}
                  </p>}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Assigned Manager
                  </label>
                  <select
                    value={newManagerId}
                    onChange={(e) => setNewManagerId(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px', background: 'var(--retail-card)' }}
                  >
                    <option value="">No manager assigned</option>
                    {filteredManagerOptions.map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.email} · {manager.role.replaceAll('_', ' ')} · {manager.locationIds.length ? `Assigned (${manager.locationIds.length} locations)` : 'Unassigned'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 168px), 1fr))', gap: '14px', marginBottom: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Manager assignment status
                  </label>
                  <select
                    value={managerAssignmentFilter}
                    onChange={(e) => {
                      setManagerAssignmentFilter(e.target.value as 'UNASSIGNED' | 'ASSIGNED' | 'ALL');
                      setNewManagerId('');
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px', background: 'var(--retail-card)' }}
                  >
                    <option value="UNASSIGNED">Unassigned managers</option>
                    <option value="ASSIGNED">Already assigned managers</option>
                    <option value="ALL">All active managers</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Manager role
                  </label>
                  <select
                    value={managerRoleFilter}
                    onChange={(e) => {
                      setManagerRoleFilter(e.target.value as 'ALL' | ManagerOption['role']);
                      setNewManagerId('');
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px', background: 'var(--retail-card)' }}
                  >
                    <option value="ALL">All manager roles</option>
                    <option value="CENTRAL_MANAGER">Central manager</option>
                    <option value="SUB_WAREHOUSE_MANAGER">Sub-warehouse manager</option>
                    <option value="STORE_MANAGER">Store manager</option>
                  </select>
                </div>
              </div>
              <small style={{ display: 'block', margin: '-9px 0 18px', color: 'var(--retail-muted)', fontSize: '11.5px' }}>
                Existing assignments are kept; the selected manager will also receive access to this location.
              </small>

              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                  Address *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Street, City, Postal Code"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid var(--retail-edge-strong)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--retail-edge-strong)', background: 'var(--retail-card)', color: 'var(--retail-muted)', fontSize: '13px', fontWeight: 650, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 20px', borderRadius: '8px', background: 'var(--retail-accent)', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Provision Facility Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
