'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import { QuickAccessCard } from '@/components/admin';

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
  terminalLanes: string[];
  isActive: boolean;
  address: string;
}

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
  const [invoicePrefix, setInvoicePrefix] = useState('');
  const [taxId, setTaxId] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [fiscalYearStart, setFiscalYearStart] = useState('April');
  const [companyId, setCompanyId] = useState('');
  const [saving, setSaving] = useState(false);

  // Hierarchy State
  const [nodes, setNodes] = useState<LocationNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [openDropdown, setOpenDropdown] = useState<'TYPE' | 'STATUS' | null>(null);
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);

  // Selected Node Form State
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];
  const [nodeName, setNodeName] = useState(selectedNode?.name || '');
  const [nodeCode, setNodeCode] = useState(selectedNode?.code || '');
  const [nodeType, setNodeType] = useState<LocationNode['type']>(selectedNode?.type || 'RETAIL_STORE');
  const [nodeParent, setNodeParent] = useState(selectedNode?.parentId || '');
  const [nodeLat, setNodeLat] = useState(String(selectedNode?.latitude || '12.9716'));
  const [nodeLng, setNodeLng] = useState(String(selectedNode?.longitude || '77.5946'));
  const [nodeRadius, setNodeRadius] = useState(String(selectedNode?.geofenceRadiusMeters || '50'));
  const [nodeManager, setNodeManager] = useState(selectedNode?.assignedManager || '');
  const [nodeAddress, setNodeAddress] = useState(selectedNode?.address || '');
  const [nodeActive, setNodeActive] = useState(selectedNode?.isActive ?? true);
  const [nodeLanes, setNodeLanes] = useState(selectedNode?.terminalLanes?.join(', ') || '');

  // Add Node Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<LocationNode['type']>('RETAIL_STORE');
  const [newParent, setNewParent] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newManager, setNewManager] = useState('');

  useEffect(() => {
    const token = getStoredSession()?.accessToken;
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_BASE}/companies`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE}/locations`, { headers, cache: 'no-store' }),
    ]).then(async ([companiesResponse, locationsResponse]) => {
      if (!companiesResponse.ok || !locationsResponse.ok) throw new Error('Could not load company and location records.');
      const [companiesPayload, locationsPayload] = await Promise.all([companiesResponse.json(), locationsResponse.json()]);
      const company = companiesPayload.data?.[0];
      if (company) {
        setCompanyId(company.id);
        setCompanyName(company.name || '');
        setCurrency(company.currency || 'INR');
        setTimezone(company.timezone || 'Asia/Kolkata');
        setInvoicePrefix(company.invoicePrefix || '');
      }
      const mapped: LocationNode[] = (locationsPayload.data || []).map((loc: any) => ({
        id: loc.id, code: loc.code || loc.id.slice(0, 8).toUpperCase(), name: loc.name,
        type: loc.type === 'MAIN_WAREHOUSE' ? 'CENTRAL_WAREHOUSE' : loc.type,
        parentId: loc.parentId || null, latitude: Number(loc.latitude || 0), longitude: Number(loc.longitude || 0),
        geofenceRadiusMeters: Number(loc.geofenceRadius || 0), assignedManager: loc.manager?.name || '',
        terminalLanes: [], isActive: Boolean(loc.isActive), address: loc.address || '',
      }));
      setNodes(mapped);
      if (mapped[0]) setSelectedNodeId(mapped[0].id);
    }).catch((error) => setNotice(error instanceof Error ? error.message : 'Could not load company data.'));
  }, []);

  // Edit Node Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    if (selectedNode) {
      setNodeName(selectedNode.name);
      setNodeCode(selectedNode.code);
      setNodeType(selectedNode.type);
      setNodeParent(selectedNode.parentId || '');
      setNodeLat(String(selectedNode.latitude));
      setNodeLng(String(selectedNode.longitude));
      setNodeRadius(String(selectedNode.geofenceRadiusMeters));
      setNodeManager(selectedNode.assignedManager);
      setNodeAddress(selectedNode.address);
      setNodeActive(selectedNode.isActive);
      setNodeLanes(selectedNode.terminalLanes.join(', '));
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
    const totalLanes = nodes.reduce((acc, curr) => acc + curr.terminalLanes.length, 0);
    return { total, stores, central, sub, totalLanes };
  }, [nodes]);

  const handleSaveCompany = async (e: FormEvent) => {
    e.preventDefault();
    if (!invoicePrefix.trim() || invoicePrefix.length < 2) {
      alert('Invoice prefix must be at least 2 characters.');
      return;
    }
    const token = getStoredSession()?.accessToken;
    if (!token) return setNotice('Sign in again to save company settings.');
    setSaving(true);
    try {
      const response = await fetch(companyId ? `${API_BASE}/companies/${companyId}` : `${API_BASE}/companies`, {
        method: companyId ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: companyName.trim(), currency, timezone, invoicePrefix: invoicePrefix.trim().toUpperCase() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Company settings could not be saved.');
      if (payload.data?.id) setCompanyId(payload.data.id);
      setNotice(companyId ? 'Company settings saved.' : 'Company created. You can now add locations.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Company settings could not be saved.');
    } finally { setSaving(false); }
  };

  const handleSaveNode = (e: FormEvent) => {
    e.preventDefault();
    if (!nodeName.trim()) {
      alert('Location name is required.');
      return;
    }

    setIsEditModalOpen(false);
    setNotice('Location editing is not available through the current API. No changes were saved.');
  };

  const handleAddNode = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCode.trim()) {
      alert('Name and Code are required.');
      return;
    }

    const token = getStoredSession()?.accessToken;
    if (!token) return setNotice('Sign in again to create a location.');
    if (!companyId) return setNotice('Create the company profile before adding locations.');
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/locations`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, name: newName.trim(), type: newType === 'CENTRAL_WAREHOUSE' ? 'MAIN_WAREHOUSE' : newType, address: newAddress.trim() || undefined, parentId: newParent || undefined }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Location could not be created.');
      const loc = payload.data;
      const node: LocationNode = { id: loc.id, code: loc.code || loc.id.slice(0, 8).toUpperCase(), name: loc.name, type: loc.type === 'MAIN_WAREHOUSE' ? 'CENTRAL_WAREHOUSE' : loc.type, parentId: loc.parentId || null, latitude: Number(loc.latitude || 0), longitude: Number(loc.longitude || 0), geofenceRadiusMeters: Number(loc.geofenceRadius || 0), assignedManager: '', terminalLanes: [], isActive: Boolean(loc.isActive), address: loc.address || '' };
      setNodes((prev) => [...prev, node]); setSelectedNodeId(node.id); setIsAddModalOpen(false); setNewName(''); setNewCode(''); setNewAddress(''); setNotice(`Location "${node.name}" created.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Location could not be created.'); }
    finally { setSaving(false); }
  };

  const handleToggleNodeStatus = async (nodeId: string) => {
    const node = nodes.find((location) => location.id === nodeId);
    if (!node || !node.isActive) return;
    const token = getStoredSession()?.accessToken;
    if (!token) return setNotice('Sign in again to deactivate a location.');
    try {
      const response = await fetch(`${API_BASE}/locations/${nodeId}/deactivate`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Location could not be deactivated.');
      setNodes((prev) => prev.map((entry) => entry.id === nodeId ? { ...entry, isActive: false } : entry));
      setNotice(`Location ${node.name} deactivated.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Location could not be deactivated.'); }
  };

  const copyLocationInfo = (n: LocationNode) => {
    const text = `Facility: ${n.name} (${n.code}) | Type: ${n.type} | Address: ${n.address} | GPS: ${n.latitude}, ${n.longitude}`;
    navigator.clipboard.writeText(text);
    setNotice(`Coordinates & details for ${n.name} copied to clipboard!`);
  };

  const getNodeBadge = (type: LocationNode['type']) => {
    switch (type) {
      case 'CENTRAL_WAREHOUSE':
        return {
          icon: '🏢',
          label: 'Central Hub',
          bg: '#eff6ff',
          color: '#1d4ed8',
          border: '#bfdbfe',
        };
      case 'SUB_WAREHOUSE':
        return {
          icon: '🏬',
          label: 'Regional Depot',
          bg: '#f3e8fd',
          color: '#7e22ce',
          border: '#e9d5ff',
        };
      case 'RETAIL_STORE':
      default:
        return {
          icon: '🏪',
          label: 'Retail Store',
          bg: '#ecfdf5',
          color: '#047857',
          border: '#a7f3d0',
        };
    }
  };

  return (
    <div className="app-page" style={{ color: '#1e293b' }}>
      {/* Toast Alert Notice */}
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

      {/* Header: Company & Store Network with Royal Blue Badge + Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 850, margin: 0, color: '#1e293b', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Company & Store Network
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
              title="Enterprise Topology"
            >
              🏛
            </span>
          </h1>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Section View Tabs */}
          <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <button
              type="button"
              onClick={() => setActiveTab('NETWORK')}
              style={{
                border: 'none',
                background: activeTab === 'NETWORK' ? '#ffffff' : 'transparent',
                color: activeTab === 'NETWORK' ? '#1a62ea' : '#64748b',
                padding: '6px 12px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
                boxShadow: activeTab === 'NETWORK' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>🏢</span> Physical Topology
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PROFILE')}
              style={{
                border: 'none',
                background: activeTab === 'PROFILE' ? '#ffffff' : 'transparent',
                color: activeTab === 'PROFILE' ? '#1a62ea' : '#64748b',
                padding: '6px 12px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
                boxShadow: activeTab === 'PROFILE' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>⚙️</span> Billing & Tax
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
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
            <span style={{ fontSize: '15px' }}>+</span> Add Location Node
          </button>
        </div>
      </div>

      {/* SECTION 1: QUICK ACCESS (4 Folder-Tabbed Cards matching /admin/users) */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: '#475569', textTransform: 'uppercase', margin: '0 0 14px' }}>
          NETWORK OVERVIEW
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '16px' }}>
          {/* Folder Card 1: Retail Outlets & POS */}
          <QuickAccessCard
            isActive={typeFilter === 'RETAIL_STORE' && activeTab === 'NETWORK'}
            onClick={() => {
              setActiveTab('NETWORK');
              setTypeFilter(typeFilter === 'RETAIL_STORE' ? 'ALL' : 'RETAIL_STORE');
            }}
            title="Filter by Retail Stores"
            tabLabel="FACILITIES"
            avatars={[
              { text: 'DT', bg: '#059669' },
              { text: 'NM', bg: '#0d9488' },
              { text: 'WE', bg: '#10b981' },
            ]}
            groupLabel="PHYSICAL STORE"
            heading={`Retail Outlets (${kpis.stores})`}
            subheading={`${kpis.totalLanes} Active POS Lanes · Dual-Axis Lock`}
          />

          {/* Folder Card 2: Central Warehouse */}
          <QuickAccessCard
            isActive={typeFilter === 'CENTRAL_WAREHOUSE' && activeTab === 'NETWORK'}
            onClick={() => {
              setActiveTab('NETWORK');
              setTypeFilter(typeFilter === 'CENTRAL_WAREHOUSE' ? 'ALL' : 'CENTRAL_WAREHOUSE');
            }}
            title="Filter by Central Warehouses"
            tabLabel="PRIMARY HUBS"
            avatars={[{ text: 'WH', bg: '#2563eb' }]}
            groupLabel="CENTRAL DEPOT"
            heading={`Central Hub (${kpis.central})`}
            subheading="Primary Inventory Ledger · 150m Geofence"
          />

          {/* Folder Card 3: Regional Sub-Warehouses */}
          <QuickAccessCard
            isActive={typeFilter === 'SUB_WAREHOUSE' && activeTab === 'NETWORK'}
            onClick={() => {
              setActiveTab('NETWORK');
              setTypeFilter(typeFilter === 'SUB_WAREHOUSE' ? 'ALL' : 'SUB_WAREHOUSE');
            }}
            title="Filter by Regional Sub-Warehouses"
            tabLabel="REGIONAL DEPOTS"
            avatars={[{ text: 'NR', bg: '#7c3aed' }]}
            groupLabel="LOGISTICS DEPOT"
            heading={`Sub-Warehouses (${kpis.sub})`}
            subheading="Regional Transit Buffer · 100m Geofence"
          />

          {/* Summary Card 4: Corporate Profile & Tax Identity */}
          <div
            className={`drive-folder-card${activeTab === 'PROFILE' ? ' active-folder' : ''}`}
            onClick={() => setActiveTab('PROFILE')}
            title="View Corporate Identity & Tax Parameters"
            style={{ borderLeft: '4px solid #1a62ea' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px', color: '#1a62ea' }}>🏛</span>
                <strong style={{ fontSize: '13.5px', color: '#1e293b' }}>Corporate Profile</strong>
              </div>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: '#1a62ea',
                  color: '#fff',
                  fontSize: '10.5px',
                  fontWeight: 750,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {invoicePrefix}
              </div>
            </div>
            <div style={{ marginTop: '16px' }}>
              <small style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase', display: 'block' }}>
                BILLING NAMESPACE
              </small>
              <span style={{ fontSize: '12px', fontWeight: 650, color: '#334155', display: 'block', marginTop: '2px' }}>
                {invoicePrefix}-2026 · {currency} (₹) · GSTIN Configured
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW TAB 1: PHYSICAL TOPOLOGY & FACILITIES DIRECTORY */}
      {activeTab === 'NETWORK' && (
        <div>
          {/* Filter Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: '#475569', textTransform: 'uppercase', margin: 0 }}>
              FACILITY DIRECTORY ({filteredNodes.length})
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
                  border: '1px solid #cbd5e1',
                  fontSize: '12.5px',
                  outline: 'none',
                  background: '#f8fafc',
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
                    border: typeFilter !== 'ALL' ? '1px solid #93c5fd' : '1px solid #cbd5e1',
                    background: typeFilter !== 'ALL' ? '#eff6ff' : '#ffffff',
                    color: typeFilter !== 'ALL' ? '#1d4ed8' : '#334155',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span>🏢</span>
                  <span>{typeLabels[typeFilter] || 'All Facility Types'}</span>
                  <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '2px' }}>▼</span>
                </button>

                {openDropdown === 'TYPE' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      width: '220px',
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
                      padding: '6px',
                      zIndex: 60,
                    }}
                  >
                    <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
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
                  <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '2px' }}>▼</span>
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
                      FACILITY STATUS
                    </div>
                    {[
                      { value: 'ALL', label: 'All Statuses', dot: '#64748b' },
                      { value: 'ACTIVE', label: 'Active Facilities', dot: '#16a34a' },
                      { value: 'INACTIVE', label: 'Archived / Inactive', dot: '#94a3b8' },
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
                          {isSelected && <span style={{ color: '#1a62ea', fontWeight: 800 }}>✓</span>}
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

          {/* Table Container */}
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
                    <th style={{ padding: '14px 20px', width: '32%' }}>FACILITY IDENTITY</th>
                    <th style={{ padding: '14px 16px', width: '18%' }}>TYPE & HIERARCHY</th>
                    <th style={{ padding: '14px 16px', width: '20%' }}>FACILITY MANAGER</th>
                    <th style={{ padding: '14px 16px', width: '18%' }}>TERMINALS & GEOFENCE</th>
                    <th style={{ padding: '14px 20px', width: '12%', textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNodes.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏢</div>
                        <strong>No location nodes matching your active filter</strong>
                        <p style={{ margin: '4px 0 0', fontSize: '12px' }}>Try resetting the filters or provision a new facility.</p>
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
                            background: isSelected ? '#edf4fe' : '#ffffff',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease',
                            opacity: n.isActive ? 1 : 0.65,
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = '#f8fafd';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = '#ffffff';
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
                                <strong style={{ color: '#0f172a', fontSize: '13.5px', display: 'block', fontWeight: 700 }}>
                                  {n.name}
                                </strong>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                  <span
                                    style={{
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      background: '#f1f5f9',
                                      color: '#475569',
                                      fontSize: '11px',
                                      fontFamily: 'monospace',
                                      fontWeight: 700,
                                    }}
                                  >
                                    {n.code}
                                  </span>
                                  <span style={{ color: '#64748b', fontSize: '11.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
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
                              <small style={{ display: 'block', fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                                {parent ? `Parent: ${parent.name}` : 'Enterprise Root'}
                              </small>
                            </div>
                          </td>

                          {/* Col 3: FACILITY MANAGER */}
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
                              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#1e293b' }}>
                                {n.assignedManager.split('(')[0].trim()}
                              </span>
                            </div>
                          </td>

                          {/* Col 4: TERMINALS & GEOFENCE */}
                          <td style={{ padding: '13px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {n.terminalLanes.length > 0 ? (
                                <span
                                  style={{
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    background: '#e0f2fe',
                                    color: '#0369a1',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                  }}
                                >
                                  {n.terminalLanes.length} POS Lanes
                                </span>
                              ) : (
                                <span
                                  style={{
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    background: '#f1f5f9',
                                    color: '#64748b',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                  }}
                                >
                                  Logistics Hub
                                </span>
                              )}
                              <span
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: '6px',
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  color: '#475569',
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                }}
                                title={`GPS: ${n.latitude}, ${n.longitude} (Radius: ${n.geofenceRadiusMeters}m)`}
                              >
                                📍 {n.geofenceRadiusMeters}m Geofence
                              </span>
                            </div>
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
                                  color: '#64748b',
                                  fontSize: '15px',
                                  cursor: 'pointer',
                                  display: 'grid',
                                  placeItems: 'center',
                                }}
                                title="Copy Coordinates & Details"
                              >
                                🔗
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
                                  border: '1px solid #cbd5e1',
                                  background: '#ffffff',
                                  color: '#334155',
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
                                    setActiveActionMenuId(activeActionMenuId === n.id ? null : n.id);
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
                                  ···
                                </button>

                                {activeActionMenuId === n.id && (
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
                                      zIndex: 70,
                                      width: '180px',
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
                                        color: '#1e293b',
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                      }}
                                    >
                                      <span>✎</span> Edit Facility
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
                                      <span>{n.isActive ? '✕' : '✓'}</span> {n.isActive ? 'Deactivate Node' : 'Reactivate Node'}
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
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              fontSize: '11.5px',
              color: '#64748b',
              lineHeight: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '16px' }}>🔒</span>
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
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '28px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '22px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
            <span style={{ fontSize: '24px' }}>🏛</span>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                Corporate Profile & Enterprise Billing
              </h2>
              <small style={{ color: '#64748b' }}>
                Configures legal identity, base accounting currency, and global unique invoice namespace.
              </small>
            </div>
          </div>

          <form onSubmit={handleSaveCompany}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Legal Company Entity Name *
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Base Currency *
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                >
                  <option value="INR">INR - Indian Rupee (₹)</option>
                  <option value="USD">USD - US Dollar ($)</option>
                  <option value="EUR">EUR - Euro (€)</option>
                  <option value="AED">AED - UAE Dirham (د.إ)</option>
                  <option value="GBP">GBP - British Pound (£)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Operating Timezone *
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (UTC +05:30 - Standard)</option>
                  <option value="Asia/Dubai">Asia/Dubai (UTC +04:00)</option>
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                  <option value="America/New_York">America/New_York (EST / EDT)</option>
                  <option value="Europe/London">Europe/London (GMT / BST)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
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
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    color: '#1a62ea',
                  }}
                />
                <small style={{ color: '#64748b', fontSize: '11.5px', marginTop: '3px', display: 'block' }}>
                  Generates invoices as <code>{invoicePrefix}-2026-XXXXX</code>.
                </small>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Tax Registration (GSTIN / VAT ID)
                </label>
                <input
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="29AAAAA0000A1Z5"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'monospace' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Operations Support Email
                </label>
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="submit"
                style={{
                  padding: '10px 24px',
                  borderRadius: '8px',
                  background: '#1a62ea',
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
                  Configure Facility Node
                </h2>
                <small style={{ color: '#64748b' }}>
                  Dual-axis physical store binding, GPS geofencing & terminal lanes.
                </small>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNode}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Facility Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={nodeName}
                    onChange={(e) => setNodeName(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Location Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={nodeCode}
                    onChange={(e) => setNodeCode(e.target.value.toUpperCase())}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Facility Type *
                  </label>
                  <select
                    value={nodeType}
                    onChange={(e) => setNodeType(e.target.value as any)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                  >
                    <option value="RETAIL_STORE">RETAIL_STORE (Point of Sale)</option>
                    <option value="SUB_WAREHOUSE">SUB_WAREHOUSE (Regional Depot)</option>
                    <option value="CENTRAL_WAREHOUSE">CENTRAL_WAREHOUSE (Primary Hub)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Parent Logistics Node
                  </label>
                  <select
                    value={nodeParent}
                    onChange={(e) => setNodeParent(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                  >
                    <option value="">None (Enterprise Root)</option>
                    {nodes
                      .filter((n) => n.id !== selectedNodeId)
                      .map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} ({n.code})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                  Physical Facility Address *
                </label>
                <input
                  type="text"
                  required
                  value={nodeAddress}
                  onChange={(e) => setNodeAddress(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              {/* GPS Geofence */}
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                  📍 GPS Geofence & Mobile Check-in (OD-12)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Latitude</span>
                    <input
                      type="number"
                      step="0.0001"
                      value={nodeLat}
                      onChange={(e) => setNodeLat(e.target.value)}
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Longitude</span>
                    <input
                      type="number"
                      step="0.0001"
                      value={nodeLng}
                      onChange={(e) => setNodeLng(e.target.value)}
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Radius (Meters)</span>
                    <input
                      type="number"
                      min="10"
                      max="500"
                      value={nodeRadius}
                      onChange={(e) => setNodeRadius(e.target.value)}
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Manager & Terminal Lanes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Assigned Manager
                  </label>
                  <input
                    type="text"
                    value={nodeManager}
                    onChange={(e) => setNodeManager(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    POS Terminal Lanes
                  </label>
                  <input
                    type="text"
                    value={nodeLanes}
                    onChange={(e) => setNodeLanes(e.target.value)}
                    placeholder="POS-T01, POS-T02"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={nodeActive}
                    onChange={(e) => setNodeActive(e.target.checked)}
                  />
                  <span>Facility is active in corporate hierarchy and accessible for POS operations</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: '13px', fontWeight: 650, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 20px', borderRadius: '8px', background: '#1a62ea', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
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
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '28px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  Provision New Location Node
                </h2>
                <small style={{ color: '#64748b' }}>Add a warehouse or retail store to company topology.</small>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNode}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                  Location Facility Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. South Bay Retail Outlet"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Facility Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'monospace' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Facility Type *
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                  >
                    <option value="RETAIL_STORE">RETAIL_STORE</option>
                    <option value="SUB_WAREHOUSE">SUB_WAREHOUSE</option>
                    <option value="CENTRAL_WAREHOUSE">CENTRAL_WAREHOUSE</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Parent Logistics Node
                  </label>
                  <select
                    value={newParent}
                    onChange={(e) => setNewParent(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                  >
                    <option value="">Enterprise Root Node</option>
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                    Assigned Manager
                  </label>
                  <input
                    type="text"
                    value={newManager}
                    onChange={(e) => setNewManager(e.target.value)}
                    placeholder="Manager name"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                  Physical Facility Address *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Street, City, Postal Code"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: '13px', fontWeight: 650, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '9px 20px', borderRadius: '8px', background: '#1a62ea', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
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
