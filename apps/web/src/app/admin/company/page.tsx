'use client';

import { Feedback } from '@/components/ui/feedback';
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
  Warehouse,
  X,
} from 'lucide-react';
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
          icon: <Building2 size={13} aria-hidden="true" />,
          label: 'Central Hub',
          bg: 'var(--retail-accent-soft)',
          color: 'var(--retail-accent-strong)',
          border: 'light-dark(#bfdbfe, #2e425b)',
        };
      case 'SUB_WAREHOUSE':
        return {
          icon: <Warehouse size={13} aria-hidden="true" />,
          label: 'Regional Depot',
          bg: 'light-dark(#f3e8fd, #30223d)',
          color: 'light-dark(#7e22ce, #d2aef2)',
          border: 'light-dark(#e9d5ff, #402b56)',
        };
      case 'RETAIL_STORE':
      default:
        return {
          icon: <Store size={13} aria-hidden="true" />,
          label: 'Retail Store',
          bg: 'light-dark(#ecfdf5, #1d352c)',
          color: 'light-dark(#047857, #b8f6e4)',
          border: 'light-dark(#a7f3d0, #31624b)',
        };
    }
  };

  return (
    <div className="app-page admin-workspace">
      {/* Toast Alert Notice */}
      {notice && <Feedback tone="info" onDismiss={() => setNotice('')}>{notice}</Feedback>}

      {/* Header: Company & Store Network with Royal Blue Badge + Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 850, margin: 0, color: 'var(--retail-ink)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Company & Store Network
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
              title="Enterprise Topology"
            >
              <Landmark size="1em" className="inline-icon" aria-hidden="true" />
            </span>
          </h1>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Section View Tabs */}
          <div style={{ display: 'inline-flex', background: 'var(--retail-edge)', padding: '3px', borderRadius: '8px', border: '1px solid var(--retail-edge-strong)' }}>
            <button
              type="button"
              onClick={() => setActiveTab('NETWORK')}
              style={{
                border: 'none',
                background: activeTab === 'NETWORK' ? 'var(--retail-card)' : 'transparent',
                color: activeTab === 'NETWORK' ? 'var(--retail-accent)' : 'var(--retail-muted)',
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
              <span><Building2 size="1em" className="inline-icon" aria-hidden="true" /></span> Physical Topology
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PROFILE')}
              style={{
                border: 'none',
                background: activeTab === 'PROFILE' ? 'var(--retail-card)' : 'transparent',
                color: activeTab === 'PROFILE' ? 'var(--retail-accent)' : 'var(--retail-muted)',
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
              <span><Settings size="1em" className="inline-icon" aria-hidden="true" /></span> Billing & Tax
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
              background: 'var(--retail-accent)',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(26, 98, 234, 0.28)',
            }}
          >
            <span style={{ fontSize: '15px' }}><Plus size="1em" className="inline-icon" aria-hidden="true" /></span> Add Location Node
          </button>
        </div>
      </div>

      {/* SECTION 1: QUICK ACCESS (4 Folder-Tabbed Cards matching /admin/users) */}
      <details className="admin-shortcuts">
        <summary>Location shortcuts <ChevronDown size={15} aria-hidden="true" /></summary>

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
            avatars={[{ text: 'WH', bg: 'var(--retail-accent)' }]}
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
            style={{ borderLeft: '4px solid var(--retail-accent)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px', color: 'var(--retail-accent)' }}><Landmark size="1em" className="inline-icon" aria-hidden="true" /></span>
                <strong style={{ fontSize: '13.5px', color: 'var(--retail-ink)' }}>Corporate Profile</strong>
              </div>
              <div
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '50%',
                  background: 'var(--retail-accent)',
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
              <small style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--retail-muted)', textTransform: 'uppercase', display: 'block' }}>
                BILLING NAMESPACE
              </small>
              <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--retail-ink)', display: 'block', marginTop: '2px' }}>
                {invoicePrefix}-2026 · {currency} (₹) · GSTIN Configured
              </span>
            </div>
          </div>
        </div>
      </details>

      {/* VIEW TAB 1: PHYSICAL TOPOLOGY & FACILITIES DIRECTORY */}
      {activeTab === 'NETWORK' && (
        <div>
          {/* Filter Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--retail-muted)', textTransform: 'uppercase', margin: 0 }}>
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
                  border: '1px solid light-dark(#cbd5e1, #34455a)',
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
                    border: typeFilter !== 'ALL' ? '1px solid var(--retail-accent-line)' : '1px solid var(--retail-edge-strong)',
                    background: typeFilter !== 'ALL' ? 'var(--retail-accent-soft)' : 'var(--retail-card)',
                    color: typeFilter !== 'ALL' ? 'var(--retail-accent-strong)' : 'var(--retail-ink)',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span><Building2 size="1em" className="inline-icon" aria-hidden="true" /></span>
                  <span>{typeLabels[typeFilter] || 'All Facility Types'}</span>
                  <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: '2px' }}><ChevronDown size="1em" className="inline-icon" aria-hidden="true" /></span>
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
                      border: '1px solid var(--retail-edge-strong)',
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
                    border: statusFilter !== 'ALL' ? '1px solid var(--retail-accent-line)' : '1px solid var(--retail-edge-strong)',
                    background: statusFilter !== 'ALL' ? 'var(--retail-accent-soft)' : 'var(--retail-card)',
                    color: statusFilter !== 'ALL' ? 'var(--retail-accent-strong)' : 'var(--retail-ink)',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  }}
                >
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusFilter === 'ACTIVE' ? '#16a34a' : statusFilter === 'INACTIVE' ? '#94a3b8' : 'var(--retail-muted)' }}></span>
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
                      background: 'var(--retail-card)',
                      borderRadius: '12px',
                      border: '1px solid var(--retail-edge-strong)',
                      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
                      padding: '6px',
                      zIndex: 60,
                    }}
                  >
                    <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      FACILITY STATUS
                    </div>
                    {[
                      { value: 'ALL', label: 'All Statuses', dot: 'var(--retail-muted)' },
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
                          {isSelected && <span style={{ color: 'var(--retail-accent)', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
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
            <div className="admin-table-scroll" role="region" aria-label="Scrollable records" tabIndex={0}>
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
                      <td colSpan={5} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--retail-muted)' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}><Building2 size="1em" className="inline-icon" aria-hidden="true" /></div>
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
                            borderBottom: '1px solid var(--retail-edge)',
                            background: isSelected ? 'var(--retail-raised)' : 'var(--retail-card)',
                            cursor: 'pointer',
                            transition: 'background 0.12s ease',
                            opacity: n.isActive ? 1 : 0.65,
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'var(--retail-raised)';
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
                                      background: 'var(--retail-edge)',
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
                                  border: '1.5px solid light-dark(#ffffff, #3f3636)',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                }}
                              >
                                {initials}
                              </div>
                              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--retail-ink)' }}>
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
                                    background: 'light-dark(#e0f2fe, #1f2e38)',
                                    color: 'light-dark(#0369a1, #b4def5)',
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
                                    background: 'var(--retail-edge)',
                                    color: 'var(--retail-muted)',
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
                                  background: 'var(--retail-raised)',
                                  border: '1px solid var(--retail-edge-strong)',
                                  color: 'var(--retail-muted)',
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                }}
                                title={`GPS: ${n.latitude}, ${n.longitude} (Radius: ${n.geofenceRadiusMeters}m)`}
                              >
                                <MapPin size="1em" className="inline-icon" aria-hidden="true" /> {n.geofenceRadiusMeters}m Geofence
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
                                  color: 'var(--retail-muted)',
                                  fontSize: '15px',
                                  cursor: 'pointer',
                                  display: 'grid',
                                  placeItems: 'center',
                                }}
                                title="Copy Coordinates & Details"
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
                                  border: '1px solid light-dark(#cbd5e1, #34455a)',
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
                                    setActiveActionMenuId(activeActionMenuId === n.id ? null : n.id);
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
                                      position: 'absolute',
                                      right: 0,
                                      top: '34px',
                                      background: 'var(--retail-card)',
                                      borderRadius: '10px',
                                      border: '1px solid var(--retail-edge-strong)',
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
              border: '1px solid var(--retail-edge-strong)',
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
            border: '1px solid var(--retail-edge-strong)',
            borderRadius: '14px',
            padding: '28px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '22px', borderBottom: '1px solid var(--retail-edge)', paddingBottom: '16px' }}>
            <span style={{ fontSize: '24px' }}><Landmark size="1em" className="inline-icon" aria-hidden="true" /></span>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--retail-ink)' }}>
                Corporate Profile & Enterprise Billing
              </h2>
              <small style={{ color: 'var(--retail-muted)' }}>
                Configures legal identity, base accounting currency, and global unique invoice namespace.
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
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '6px' }}>
                  Base Currency *
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px', background: 'var(--retail-card)' }}
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
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px', background: 'var(--retail-card)' }}
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (UTC +05:30 - Standard)</option>
                  <option value="Asia/Dubai">Asia/Dubai (UTC +04:00)</option>
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                  <option value="America/New_York">America/New_York (EST / EDT)</option>
                  <option value="Europe/London">Europe/London (GMT / BST)</option>
                </select>
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
                    border: '1px solid light-dark(#cbd5e1, #34455a)',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    color: 'var(--retail-accent)',
                  }}
                />
                <small style={{ color: 'var(--retail-muted)', fontSize: '11.5px', marginTop: '3px', display: 'block' }}>
                  Generates invoices as <code>{invoicePrefix}-2026-XXXXX</code>.
                </small>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '6px' }}>
                  Tax Registration (GSTIN / VAT ID)
                </label>
                <input
                  type="text"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="29AAAAA0000A1Z5"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px', fontFamily: 'monospace' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '6px' }}>
                  Operations Support Email
                </label>
                <input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px' }}
                />
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
          className="admin-dialog-backdrop"
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
                  Configure Facility Node
                </h2>
                <small style={{ color: 'var(--retail-muted)' }}>
                  Dual-axis physical store binding, GPS geofencing & terminal lanes.
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Facility Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={nodeName}
                    onChange={(e) => setNodeName(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Location Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={nodeCode}
                    onChange={(e) => setNodeCode(e.target.value.toUpperCase())}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px', fontFamily: 'monospace' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Facility Type *
                  </label>
                  <select
                    value={nodeType}
                    onChange={(e) => setNodeType(e.target.value as any)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px', background: 'var(--retail-card)' }}
                  >
                    <option value="RETAIL_STORE">RETAIL_STORE (Point of Sale)</option>
                    <option value="SUB_WAREHOUSE">SUB_WAREHOUSE (Regional Depot)</option>
                    <option value="CENTRAL_WAREHOUSE">CENTRAL_WAREHOUSE (Primary Hub)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Parent Logistics Node
                  </label>
                  <select
                    value={nodeParent}
                    onChange={(e) => setNodeParent(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px', background: 'var(--retail-card)' }}
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
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                  Physical Facility Address *
                </label>
                <input
                  type="text"
                  required
                  value={nodeAddress}
                  onChange={(e) => setNodeAddress(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px' }}
                />
              </div>

              {/* GPS Geofence */}
              <div style={{ padding: '12px', background: 'var(--retail-raised)', borderRadius: '8px', border: '1px solid var(--retail-edge-strong)', marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '8px' }}>
                  <MapPin size="1em" className="inline-icon" aria-hidden="true" /> GPS Geofence & Mobile Check-in (OD-12)
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--retail-muted)' }}>Latitude</span>
                    <input
                      type="number"
                      step="0.0001"
                      value={nodeLat}
                      onChange={(e) => setNodeLat(e.target.value)}
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '12.5px' }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--retail-muted)' }}>Longitude</span>
                    <input
                      type="number"
                      step="0.0001"
                      value={nodeLng}
                      onChange={(e) => setNodeLng(e.target.value)}
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '12.5px' }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--retail-muted)' }}>Radius (Meters)</span>
                    <input
                      type="number"
                      min="10"
                      max="500"
                      value={nodeRadius}
                      onChange={(e) => setNodeRadius(e.target.value)}
                      style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '12.5px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Manager & Terminal Lanes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Assigned Manager
                  </label>
                  <input
                    type="text"
                    value={nodeManager}
                    onChange={(e) => setNodeManager(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    POS Terminal Lanes
                  </label>
                  <input
                    type="text"
                    value={nodeLanes}
                    onChange={(e) => setNodeLanes(e.target.value)}
                    placeholder="POS-T01, POS-T02"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--retail-ink)' }}>
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
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid light-dark(#cbd5e1, #34455a)', background: 'var(--retail-card)', color: 'var(--retail-muted)', fontSize: '13px', fontWeight: 650, cursor: 'pointer' }}
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
          className="admin-dialog-backdrop"
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
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Facility Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px', fontFamily: 'monospace' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Facility Type *
                  </label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px', background: 'var(--retail-card)' }}
                  >
                    <option value="RETAIL_STORE">RETAIL_STORE</option>
                    <option value="SUB_WAREHOUSE">SUB_WAREHOUSE</option>
                    <option value="CENTRAL_WAREHOUSE">CENTRAL_WAREHOUSE</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Parent Logistics Node
                  </label>
                  <select
                    value={newParent}
                    onChange={(e) => setNewParent(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px', background: 'var(--retail-card)' }}
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
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                    Assigned Manager
                  </label>
                  <input
                    type="text"
                    value={newManager}
                    onChange={(e) => setNewManager(e.target.value)}
                    placeholder="Manager name"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--retail-ink)', marginBottom: '5px' }}>
                  Physical Facility Address *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Street, City, Postal Code"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid light-dark(#cbd5e1, #34455a)', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid light-dark(#cbd5e1, #34455a)', background: 'var(--retail-card)', color: 'var(--retail-muted)', fontSize: '13px', fontWeight: 650, cursor: 'pointer' }}
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
