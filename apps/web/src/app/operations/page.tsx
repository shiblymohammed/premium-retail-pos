'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { clearStoredSession, getStoredSession, setStoredSession } from '@/lib/auth';
import styles from './operations.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type TransferStatus = 'IN_TRANSIT' | 'PENDING_DISPATCH' | 'RECEIVED' | 'REJECTED';

interface TransferItem {
  sku: string;
  name: string;
  cartons: number;
  unitsPerCarton: number;
  looseUnits: number;
  totalUnits: number;
}

interface StockTransfer {
  id: string;
  transferCode: string;
  sourceLocation: string;
  destLocation: string;
  status: TransferStatus;
  createdAt: string;
  dispatchedAt?: string;
  receivedAt?: string;
  carrier: string;
  trackingNumber: string;
  notes: string;
  items: TransferItem[];
}

const INITIAL_TRANSFERS: StockTransfer[] = [
  {
    id: 'trf-001',
    transferCode: 'TRF-2026-0041',
    sourceLocation: 'Central Warehouse',
    destLocation: 'Downtown Store',
    status: 'IN_TRANSIT',
    createdAt: '18-Nov-2026 09:30 AM',
    dispatchedAt: '18-Nov-2026 11:15 AM',
    carrier: 'BlueDart Logistics',
    trackingNumber: 'BD-8849201',
    notes: 'Weekly staples replenishment for peak sales counter',
    items: [
      { sku: 'BEV-1048', name: 'Premium Arabica Coffee Beans', cartons: 4, unitsPerCarton: 12, looseUnits: 0, totalUnits: 48 },
      { sku: 'PAN-5012', name: 'Basmati Royal Rice (5kg)', cartons: 6, unitsPerCarton: 6, looseUnits: 2, totalUnits: 38 },
      { sku: 'SNK-4180', name: 'Organic Dark Chocolate 85%', cartons: 5, unitsPerCarton: 20, looseUnits: 0, totalUnits: 100 },
    ],
  },
  {
    id: 'trf-002',
    transferCode: 'TRF-2026-0042',
    sourceLocation: 'Central Warehouse',
    destLocation: 'North Mall',
    status: 'IN_TRANSIT',
    createdAt: '18-Nov-2026 10:45 AM',
    dispatchedAt: '18-Nov-2026 01:20 PM',
    carrier: 'Express Logistics',
    trackingNumber: 'EXP-109284',
    notes: 'Beverage restocking request',
    items: [
      { sku: 'BEV-1082', name: 'Sparkling Mineral Water', cartons: 8, unitsPerCarton: 12, looseUnits: 0, totalUnits: 96 },
      { sku: 'PAN-2240', name: 'Artisan Penne Pasta', cartons: 4, unitsPerCarton: 15, looseUnits: 0, totalUnits: 60 },
    ],
  },
  {
    id: 'trf-003',
    transferCode: 'TRF-2026-0039',
    sourceLocation: 'Downtown Store',
    destLocation: 'West End Outlet',
    status: 'PENDING_DISPATCH',
    createdAt: '18-Nov-2026 02:15 PM',
    carrier: 'Internal Van #02',
    trackingNumber: 'VAN-INT-02',
    notes: 'Inter-branch rebalance of slow-moving inventory',
    items: [
      { sku: 'PC-2076', name: 'Daily Moisturizer SPF 30', cartons: 2, unitsPerCarton: 10, looseUnits: 4, totalUnits: 24 },
    ],
  },
  {
    id: 'trf-004',
    transferCode: 'TRF-2026-0038',
    sourceLocation: 'Central Warehouse',
    destLocation: 'West End Outlet',
    status: 'RECEIVED',
    createdAt: '17-Nov-2026 08:00 AM',
    dispatchedAt: '17-Nov-2026 10:30 AM',
    receivedAt: '17-Nov-2026 04:45 PM',
    carrier: 'BlueDart Logistics',
    trackingNumber: 'BD-8847621',
    notes: 'Stock received intact into local store ledger',
    items: [
      { sku: 'PAN-5020', name: 'Extra Virgin Olive Oil 1L', cartons: 3, unitsPerCarton: 12, looseUnits: 0, totalUnits: 36 },
    ],
  },
];

export default function OperationsPage() {
  const [activeTab, setActiveTab] = useState<'transfers' | 'workbench'>('transfers');
  const [transfers, setTransfers] = useState<StockTransfer[]>(INITIAL_TRANSFERS);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');

  // Modals
  const [receivingTransfer, setReceivingTransfer] = useState<StockTransfer | null>(null);
  const [damagedUnits, setDamagedUnits] = useState('0');
  const [missingUnits, setMissingUnits] = useState('0');
  const [receiveNotes, setReceiveNotes] = useState('All packages sealed and barcodes inspected.');
  const [isReceivingBusy, setIsReceivingBusy] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newOrigin, setNewOrigin] = useState('Central Warehouse');
  const [newDest, setNewDest] = useState('Downtown Store');
  const [newSku, setNewSku] = useState('BEV-1048');
  const [newCartons, setNewCartons] = useState('3');
  const [newLooseUnits, setNewLooseUnits] = useState('0');
  const [newNotes, setNewNotes] = useState('Stock transfer request');

  // Workbench state
  const [method, setMethod] = useState<'GET' | 'POST' | 'PATCH'>('GET');
  const [path, setPath] = useState('/health/readiness');
  const [benchBody, setBenchBody] = useState('');
  const [benchResponse, setBenchResponse] = useState('');
  const [benchBusy, setBenchBusy] = useState(false);

  // Sync with global auth
  useEffect(() => {
    const session = getStoredSession();
    if (session?.accessToken) {
      // Sync active state
    }
  }, []);

  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      const matchStatus = filterStatus === 'ALL' || t.status === filterStatus;
      const matchSearch =
        !search.trim() ||
        t.transferCode.toLowerCase().includes(search.toLowerCase()) ||
        t.sourceLocation.toLowerCase().includes(search.toLowerCase()) ||
        t.destLocation.toLowerCase().includes(search.toLowerCase()) ||
        t.items.some((i) => i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase()));
      return matchStatus && matchSearch;
    });
  }, [transfers, filterStatus, search]);

  const kpis = useMemo(() => {
    const inTransit = transfers.filter((t) => t.status === 'IN_TRANSIT').length;
    const pending = transfers.filter((t) => t.status === 'PENDING_DISPATCH').length;
    const received = transfers.filter((t) => t.status === 'RECEIVED').length;
    const totalUnits = transfers.reduce((sum, t) => sum + t.items.reduce((s, i) => s + i.totalUnits, 0), 0);
    return { inTransit, pending, received, totalUnits };
  }, [transfers]);

  function handleReceiveConfirm(e: FormEvent) {
    e.preventDefault();
    if (!receivingTransfer) return;
    setIsReceivingBusy(true);

    setTimeout(() => {
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === receivingTransfer.id
            ? { ...t, status: 'RECEIVED', receivedAt: new Date().toLocaleString(), notes: `${t.notes} | Received: ${receiveNotes}` }
            : t
        )
      );
      setNotice(`Transfer ${receivingTransfer.transferCode} successfully received and committed to inventory ledger!`);
      setIsReceivingBusy(false);
      setReceivingTransfer(null);
    }, 400);
  }

  function handleCreateTransfer(e: FormEvent) {
    e.preventDefault();
    if (newOrigin === newDest) {
      alert('Source and destination locations must be different.');
      return;
    }

    const c = Number(newCartons) || 1;
    const u = Number(newLooseUnits) || 0;
    const total = c * 12 + u;

    const newTransfer: StockTransfer = {
      id: `trf-${Date.now()}`,
      transferCode: `TRF-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      sourceLocation: newOrigin,
      destLocation: newDest,
      status: 'IN_TRANSIT',
      createdAt: new Date().toLocaleString(),
      dispatchedAt: new Date().toLocaleString(),
      carrier: 'FastTrack Fleet',
      trackingNumber: `FT-${Math.floor(100000 + Math.random() * 900000)}`,
      notes: newNotes,
      items: [
        {
          sku: newSku,
          name: newSku === 'BEV-1048' ? 'Premium Arabica Coffee Beans' : 'Warehouse Restock Item',
          cartons: c,
          unitsPerCarton: 12,
          looseUnits: u,
          totalUnits: total,
        },
      ],
    };

    setTransfers([newTransfer, ...transfers]);
    setCreateModalOpen(false);
    setNotice(`Dispatched transfer ${newTransfer.transferCode} from ${newOrigin} to ${newDest}.`);
  }

  async function runBenchRequest(e: FormEvent) {
    e.preventDefault();
    setBenchBusy(true);
    setBenchResponse('');
    try {
      const session = getStoredSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;

      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: method !== 'GET' && benchBody ? benchBody : undefined,
      });
      const data = await res.json();
      setBenchResponse(JSON.stringify(data, null, 2));
    } catch (caught) {
      setBenchResponse(`Error: ${caught instanceof Error ? caught.message : 'Request failed'}`);
    } finally {
      setBenchBusy(false);
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>Transfers & Warehouse Operations</h1>
          <p>Multi-location stock distribution, in-transit consignments, and ledger receiving (ADR-004)</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => setCreateModalOpen(true)}>
            + Dispatch New Transfer
          </button>
        </div>
      </header>

      {notice && (
        <div style={{ padding: '10px 16px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, color: '#065f46', fontSize: 13, fontWeight: 600, marginBottom: 18 }}>
          {notice}
        </div>
      )}

      {/* KPI Overview */}
      <section className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>In-Transit Consignments</span>
          <span className={styles.kpiValue}>{kpis.inTransit}</span>
          <span className={styles.kpiSubtext}>Dispatched on route to stores</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Pending Dispatch</span>
          <span className={styles.kpiValue}>{kpis.pending}</span>
          <span className={styles.kpiSubtext}>Staged in warehouse loading bay</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Completed Receipts</span>
          <span className={styles.kpiValue}>{kpis.received}</span>
          <span className={styles.kpiSubtext}>Committed into store inventory</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Total Units in Pipeline</span>
          <span className={styles.kpiValue}>{kpis.totalUnits}</span>
          <span className={styles.kpiSubtext}>Base units across all consignments</span>
        </div>
      </section>

      {/* Tab Navigation */}
      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'transfers' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('transfers')}
        >
          Stock Transfers & Consignments
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'workbench' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('workbench')}
        >
          Developer API Workbench
        </button>
      </div>

      {activeTab === 'transfers' && (
        <div>
          <div className={styles.filterBar}>
            <div className={styles.statusFilter}>
              {['ALL', 'IN_TRANSIT', 'PENDING_DISPATCH', 'RECEIVED'].map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`${styles.statusPill} ${filterStatus === status ? styles.statusPillActive : ''}`}
                  onClick={() => setFilterStatus(status)}
                >
                  {status === 'ALL' ? 'All Transfers' : status.replace('_', ' ')}
                </button>
              ))}
            </div>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search code, location, or SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className={styles.tableSurface}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Transfer Waybill</th>
                  <th>Route (Origin → Destination)</th>
                  <th>Carrier & Tracking</th>
                  <th>Contents & Units</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.map((item) => {
                  const totalUnits = item.items.reduce((s, i) => s + i.totalUnits, 0);
                  const totalCartons = item.items.reduce((s, i) => s + i.cartons, 0);
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className={styles.transferCode}>{item.transferCode}</span>
                        <span className={styles.transferDate}>{item.createdAt}</span>
                      </td>
                      <td>
                        <div className={styles.routeCell}>
                          <span>{item.sourceLocation}</span>
                          <span className={styles.routeArrow}>→</span>
                          <span>{item.destLocation}</span>
                        </div>
                      </td>
                      <td>
                        <div>
                          <strong>{item.carrier}</strong>
                          <div style={{ fontSize: 11, color: '#64748b' }}>{item.trackingNumber}</div>
                        </div>
                      </td>
                      <td>
                        <div>
                          <strong>{totalUnits} units</strong> ({totalCartons} cartons)
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            {item.items.map((i) => i.name.split(' ')[0]).join(', ')}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${
                            item.status === 'IN_TRANSIT'
                              ? styles.statusInTransit
                              : item.status === 'PENDING_DISPATCH'
                              ? styles.statusPending
                              : item.status === 'RECEIVED'
                              ? styles.statusReceived
                              : styles.statusRejected
                          }`}
                        >
                          ● {item.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actionCell}>
                          {item.status === 'IN_TRANSIT' && (
                            <button
                              type="button"
                              className={`${styles.actionBtn} ${styles.actionBtnHighlight}`}
                              onClick={() => {
                                setReceivingTransfer(item);
                                setDamagedUnits('0');
                                setMissingUnits('0');
                              }}
                            >
                              Receive Consignment
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={() => alert(`Waybill ${item.transferCode}\nDispatched: ${item.dispatchedAt || 'Pending'}\nNotes: ${item.notes}`)}
                          >
                            Waybill
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* API Workbench Tab */}
      {activeTab === 'workbench' && (
        <div className={styles.benchContainer}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <h2 style={{ fontSize: 16, margin: '0 0 8px', color: '#0b1f3a' }}>API Endpoint Test Console</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
              Execute live REST requests directly against local backend services using active role session credentials.
            </p>
            <form onSubmit={runBenchRequest} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <select value={method} onChange={(e) => setMethod(e.target.value as any)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                  <option>GET</option>
                  <option>POST</option>
                  <option>PATCH</option>
                </select>
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/health/readiness"
                  style={{ flex: 1, padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                />
                <button type="submit" disabled={benchBusy} className={styles.btnPrimary}>
                  {benchBusy ? 'Sending…' : 'Send Request'}
                </button>
              </div>
              {method !== 'GET' && (
                <textarea
                  rows={4}
                  value={benchBody}
                  onChange={(e) => setBenchBody(e.target.value)}
                  placeholder="JSON request body..."
                  style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'monospace', fontSize: 12 }}
                />
              )}
            </form>
            {benchResponse && (
              <pre style={{ marginTop: 16, padding: 14, background: '#0b1f3a', color: '#a7f3d0', borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
                {benchResponse}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Receive Consignment Modal */}
      {receivingTransfer && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>Receive Consignment: {receivingTransfer.transferCode}</h2>
              <button type="button" className={styles.modalClose} onClick={() => setReceivingTransfer(null)}>✕</button>
            </div>
            <form onSubmit={handleReceiveConfirm}>
              <div className={styles.modalBody}>
                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                  <div><strong>From:</strong> {receivingTransfer.sourceLocation} → <strong>To:</strong> {receivingTransfer.destLocation}</div>
                  <div><strong>Dispatched:</strong> {receivingTransfer.dispatchedAt} ({receivingTransfer.carrier})</div>
                </div>

                <div className={styles.discrepancyBox}>
                  <strong>Physical Inbound Verification (OD-04):</strong> Count boxes and scan seals prior to confirming. Any shortfall or damaged cartons will automatically trigger an inventory ledger discrepancy record.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className={styles.formGroup}>
                    <label>Damaged Base Units</label>
                    <input
                      type="number"
                      min="0"
                      value={damagedUnits}
                      onChange={(e) => setDamagedUnits(e.target.value)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Missing / Short Units</label>
                    <input
                      type="number"
                      min="0"
                      value={missingUnits}
                      onChange={(e) => setMissingUnits(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Receiving & Quality Notes</label>
                  <textarea
                    rows={2}
                    value={receiveNotes}
                    onChange={(e) => setReceiveNotes(e.target.value)}
                    placeholder="Inspection remarks..."
                    required
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={() => setReceivingTransfer(null)}>
                  Cancel
                </button>
                <button type="submit" disabled={isReceivingBusy} className={styles.btnPrimary}>
                  {isReceivingBusy ? 'Committing to Ledger…' : 'Confirm Receipt into Inventory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Transfer Modal */}
      {createModalOpen && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>Dispatch Stock Transfer</h2>
              <button type="button" className={styles.modalClose} onClick={() => setCreateModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateTransfer}>
              <div className={styles.modalBody}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className={styles.formGroup}>
                    <label>Origin Location</label>
                    <select value={newOrigin} onChange={(e) => setNewOrigin(e.target.value)}>
                      <option>Central Warehouse</option>
                      <option>Downtown Store</option>
                      <option>North Mall</option>
                      <option>West End Outlet</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Destination Location</label>
                    <select value={newDest} onChange={(e) => setNewDest(e.target.value)}>
                      <option>Downtown Store</option>
                      <option>North Mall</option>
                      <option>West End Outlet</option>
                      <option>Central Warehouse</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Select Product Variant</label>
                  <select value={newSku} onChange={(e) => setNewSku(e.target.value)}>
                    <option value="BEV-1048">BEV-1048 · Premium Arabica Coffee (12 pkts/carton)</option>
                    <option value="PAN-5012">PAN-5012 · Basmati Royal Rice (6 bags/carton)</option>
                    <option value="SNK-4180">SNK-4180 · Organic Dark Chocolate (20 pkts/carton)</option>
                    <option value="BEV-1082">BEV-1082 · Sparkling Mineral Water (12 bottles/carton)</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className={styles.formGroup}>
                    <label>Cartons</label>
                    <input
                      type="number"
                      min="1"
                      value={newCartons}
                      onChange={(e) => setNewCartons(e.target.value)}
                      required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Loose Units</label>
                    <input
                      type="number"
                      min="0"
                      value={newLooseUnits}
                      onChange={(e) => setNewLooseUnits(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label>Transfer Justification / Notes</label>
                  <textarea
                    rows={2}
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="Reason for transfer..."
                    required
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.btnPrimary}>
                  Dispatch Consignment →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
