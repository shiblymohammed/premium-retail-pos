'use client';

import { FormEvent, Fragment, useEffect, useMemo, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import { PillDropdown } from '@/components/ui/pill-dropdown';
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

interface ReceiptSummary {
  good: number;
  damaged: number;
  missing: number;
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
  receipt?: ReceiptSummary;
}

const LOCATIONS = ['Central Warehouse', 'Downtown Store', 'North Mall', 'West End Outlet'];
const CARRIERS = [
  { name: 'BlueDart Logistics', hint: 'Courier · same day' },
  { name: 'Express Logistics', hint: 'Courier · next day' },
  { name: 'FastTrack Fleet', hint: 'Own fleet' },
  { name: 'Internal Van #02', hint: 'Store-to-store' },
];

/** Products that can be transferred, with their carton size. */
const CATALOG = [
  { sku: 'BEV-1048', name: 'Premium Arabica Coffee Beans', unitsPerCarton: 12 },
  { sku: 'BEV-1082', name: 'Sparkling Mineral Water', unitsPerCarton: 12 },
  { sku: 'PAN-5012', name: 'Basmati Royal Rice (5kg)', unitsPerCarton: 6 },
  { sku: 'PAN-5020', name: 'Extra Virgin Olive Oil 1L', unitsPerCarton: 12 },
  { sku: 'SNK-4180', name: 'Organic Dark Chocolate 85%', unitsPerCarton: 20 },
  { sku: 'PC-2076', name: 'Daily Moisturizer SPF 30', unitsPerCarton: 10 },
];

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
    receipt: { good: 36, damaged: 0, missing: 0 },
  },
];

type StatusFilter = 'ALL' | TransferStatus;
type SortKey = 'newest' | 'oldest' | 'units';

const STATUS_META: Record<TransferStatus, { label: string; tone: string }> = {
  IN_TRANSIT: { label: 'In transit', tone: 'transit' },
  PENDING_DISPATCH: { label: 'Awaiting dispatch', tone: 'pending' },
  RECEIVED: { label: 'Received', tone: 'received' },
  REJECTED: { label: 'Rejected', tone: 'rejected' },
};

/** "18-Nov-2026 09:30 AM" style timestamp, matching the existing data. */
function stamp(date = new Date()) {
  const d = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
  const t = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${d} ${t}`;
}
/** Parses the stamp format back into a Date for sorting. */
function parseStamp(value?: string) {
  if (!value) return 0;
  const m = value.match(/(\d{1,2})-(\w{3})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return Date.parse(value) || 0;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let h = Number(m[4]) % 12;
  if (m[6].toUpperCase() === 'PM') h += 12;
  return new Date(Number(m[3]), months.indexOf(m[2].toLowerCase()), Number(m[1]), h, Number(m[5])).getTime();
}
/** "18-Nov-2026 09:30 AM" → { day: "18 Nov", time: "09:30 AM" } */
function splitStamp(value: string) {
  const [d, ...rest] = value.split(' ');
  return { day: d.split('-').slice(0, 2).join(' '), time: rest.join(' ') };
}
const unitsOf = (t: StockTransfer) => t.items.reduce((s, i) => s + i.totalUnits, 0);
const cartonsOf = (t: StockTransfer) => t.items.reduce((s, i) => s + i.cartons, 0);
const hasIssues = (t: StockTransfer) => !!t.receipt && t.receipt.damaged + t.receipt.missing > 0;
const isWarehouse = (loc: string) => loc.includes('Warehouse');

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const icons: Record<string, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    truck: <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
    box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17h.01" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    warehouse: <><path d="M3 21V9l9-6 9 6v12" /><path d="M7 21v-8h10v8M7 17h10" /></>,
    store: <><path d="M4 10v10h16V10" /><path d="M3 10 5 4h14l2 6c0 1.4-1.1 2.5-2.5 2.5S16 11.4 16 10c0 1.4-1.1 2.5-2.5 2.5h-3C9.1 12.5 8 11.4 8 10c0 1.4-1.1 2.5-2.5 2.5S3 11.4 3 10Z" /></>,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    download: <><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></>,
    copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
    code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />,
    send: <path d="M4 12 20 4l-6 16-3-7z" />,
    sort: <path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4" />,
    swap: <path d="M4 8h15M15 4l4 4-4 4M20 16H5m4-4-4 4 4 4" />,
    more: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name] || <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}

type DraftQty = { cartons: number; loose: number };

export default function OperationsPage() {
  const [transfers, setTransfers] = useState<StockTransfer[]>(INITIAL_TRANSFERS);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL'); // store chosen in the top bar
  const [fromFilter, setFromFilter] = useState('ALL');
  const [toFilter, setToFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  // Receive modal
  const [receivingTransfer, setReceivingTransfer] = useState<StockTransfer | null>(null);
  const [damagedUnits, setDamagedUnits] = useState(0);
  const [missingUnits, setMissingUnits] = useState(0);
  const [receiveNotes, setReceiveNotes] = useState('All packages sealed and barcodes inspected.');
  const [receiveError, setReceiveError] = useState('');
  const [isReceivingBusy, setIsReceivingBusy] = useState(false);

  // Create modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newOrigin, setNewOrigin] = useState('Central Warehouse');
  const [newDest, setNewDest] = useState('Downtown Store');
  const [newCarrier, setNewCarrier] = useState(CARRIERS[0].name);
  const [draft, setDraft] = useState<Record<string, DraftQty>>({});
  const [newNotes, setNewNotes] = useState('');
  const [dispatchNow, setDispatchNow] = useState(true);
  const [createError, setCreateError] = useState('');

  // API console (developer tool, collapsed by default)
  const [method, setMethod] = useState<'GET' | 'POST' | 'PATCH'>('GET');
  const [path, setPath] = useState('/health/readiness');
  const [benchBody, setBenchBody] = useState('');
  const [benchResponse, setBenchResponse] = useState('');
  const [benchStatus, setBenchStatus] = useState<number | null>(null);
  const [benchBusy, setBenchBusy] = useState(false);

  // Follow the store chosen in the top bar
  useEffect(() => {
    const apply = (name: string | null) => setLocationFilter(name && LOCATIONS.includes(name) ? name : 'ALL');
    apply(window.localStorage.getItem('premium-retail-location-scope'));
    const sync = (event: Event) => apply((event as CustomEvent<string>).detail);
    window.addEventListener('premium-retail-location-change', sync);
    return () => window.removeEventListener('premium-retail-location-change', sync);
  }, []);

  // Escape closes modals / menus; clicking elsewhere closes the row menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setReceivingTransfer(null);
      setCreateModalOpen(false);
      setMenuFor(null);
    };
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-row-menu]')) setMenuFor(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick); };
  }, []);

  // Auto-hide notices
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const scoped = useMemo(
    () => transfers.filter((t) => locationFilter === 'ALL' || t.sourceLocation === locationFilter || t.destLocation === locationFilter),
    [transfers, locationFilter],
  );

  const filteredTransfers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = scoped.filter((t) => {
      const matchStatus = filterStatus === 'ALL' || t.status === filterStatus;
      if ((fromFilter !== 'ALL' && t.sourceLocation !== fromFilter) || (toFilter !== 'ALL' && t.destLocation !== toFilter)) return false;
      const matchSearch = !q
        || t.transferCode.toLowerCase().includes(q)
        || t.sourceLocation.toLowerCase().includes(q)
        || t.destLocation.toLowerCase().includes(q)
        || t.carrier.toLowerCase().includes(q)
        || t.trackingNumber.toLowerCase().includes(q)
        || t.items.some((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q));
      return matchStatus && matchSearch;
    });
    return list.sort((a, b) => (sortKey === 'units' ? unitsOf(b) - unitsOf(a) : (parseStamp(b.createdAt) - parseStamp(a.createdAt)) * (sortKey === 'newest' ? 1 : -1)));
  }, [scoped, filterStatus, fromFilter, toFilter, sortKey, search]);

  const kpis = useMemo(() => {
    const inTransit = scoped.filter((t) => t.status === 'IN_TRANSIT');
    const pending = scoped.filter((t) => t.status === 'PENDING_DISPATCH');
    const received = scoped.filter((t) => t.status === 'RECEIVED');
    return {
      inTransit: inTransit.length,
      inTransitUnits: inTransit.reduce((s, t) => s + unitsOf(t), 0),
      pending: pending.length,
      pendingUnits: pending.reduce((s, t) => s + unitsOf(t), 0),
      received: received.length,
      withIssues: received.filter(hasIssues).length,
      openUnits: scoped.filter((t) => t.status !== 'RECEIVED').reduce((s, t) => s + unitsOf(t), 0),
    };
  }, [scoped]);

  const count = (s: StatusFilter) => (s === 'ALL' ? scoped.length : scoped.filter((t) => t.status === s).length);

  // ---------- actions ----------
  function openReceive(t: StockTransfer) {
    setMenuFor(null);
    setReceivingTransfer(t);
    setDamagedUnits(0);
    setMissingUnits(0);
    setReceiveNotes('All packages sealed and barcodes inspected.');
    setReceiveError('');
  }

  function handleReceiveConfirm(e: FormEvent) {
    e.preventDefault();
    if (!receivingTransfer) return;
    const total = unitsOf(receivingTransfer);
    if (damagedUnits + missingUnits > total) {
      setReceiveError(`Damaged and missing (${damagedUnits + missingUnits}) can't be more than the ${total} units sent.`);
      return;
    }
    if (!receiveNotes.trim()) { setReceiveError('Please add a short note.'); return; }
    setIsReceivingBusy(true);
    const { id, transferCode } = receivingTransfer;
    const damaged = damagedUnits;
    const missing = missingUnits;
    window.setTimeout(() => {
      setTransfers((prev) => prev.map((t) => (t.id === id
        ? { ...t, status: 'RECEIVED', receivedAt: stamp(), notes: `${t.notes} | Received: ${receiveNotes.trim()}`, receipt: { good: total - damaged - missing, damaged, missing } }
        : t)));
      setNotice(damaged + missing
        ? `${transferCode} received. ${damaged} damaged and ${missing} missing units were logged.`
        : `${transferCode} received in full. ${total} units added to stock.`);
      setIsReceivingBusy(false);
      setReceivingTransfer(null);
      setExpanded(id);
    }, 400);
  }

  function dispatchTransfer(t: StockTransfer) {
    setMenuFor(null);
    setTransfers((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: 'IN_TRANSIT', dispatchedAt: stamp() } : x)));
    setNotice(`${t.transferCode} dispatched and now on its way to ${t.destLocation}.`);
  }

  function openCreate() {
    // Start from the route filters if set, otherwise warehouse → the store chosen in the top bar
    const origin = fromFilter !== 'ALL' ? fromFilter : 'Central Warehouse';
    const fallbackDest = locationFilter !== 'ALL' && locationFilter !== origin ? locationFilter : LOCATIONS.find((l) => l !== origin && !isWarehouse(l)) ?? LOCATIONS[1];
    setNewOrigin(origin);
    setNewDest(toFilter !== 'ALL' && toFilter !== origin ? toFilter : fallbackDest);
    setNewCarrier(CARRIERS[0].name);
    setDraft({ [CATALOG[0].sku]: { cartons: 3, loose: 0 } });
    setNewNotes('');
    setDispatchNow(true);
    setCreateError('');
    setCreateModalOpen(true);
  }

  const draftItems: TransferItem[] = CATALOG.filter((p) => draft[p.sku]).map((p) => {
    const q = draft[p.sku];
    return { sku: p.sku, name: p.name, cartons: q.cartons, unitsPerCarton: p.unitsPerCarton, looseUnits: q.loose, totalUnits: q.cartons * p.unitsPerCarton + q.loose };
  });
  const draftTotal = draftItems.reduce((s, i) => s + i.totalUnits, 0);
  const setQty = (sku: string, key: keyof DraftQty, value: number) => setDraft((d) => ({ ...d, [sku]: { ...d[sku], [key]: Math.max(0, value) } }));
  const toggleProduct = (sku: string) => setDraft((d) => {
    const next = { ...d };
    if (next[sku]) delete next[sku]; else next[sku] = { cartons: 1, loose: 0 };
    return next;
  });

  function handleCreateTransfer(e: FormEvent) {
    e.preventDefault();
    if (newOrigin === newDest) { setCreateError('Pick a different destination.'); return; }
    if (!draftItems.length) { setCreateError('Choose at least one product to send.'); return; }
    if (draftItems.some((i) => i.totalUnits <= 0)) { setCreateError('Each product needs at least one carton or loose unit.'); return; }

    const now = stamp();
    const prefix = newCarrier.startsWith('Internal') ? 'VAN-INT' : newCarrier.split(' ')[0].slice(0, 3).toUpperCase();
    const created: StockTransfer = {
      id: `trf-${Date.now()}`,
      transferCode: `TRF-2026-${String(Math.floor(1000 + Math.random() * 9000))}`,
      sourceLocation: newOrigin,
      destLocation: newDest,
      status: dispatchNow ? 'IN_TRANSIT' : 'PENDING_DISPATCH',
      createdAt: now,
      dispatchedAt: dispatchNow ? now : undefined,
      carrier: newCarrier,
      trackingNumber: `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`,
      notes: newNotes.trim() || 'Stock transfer request',
      items: draftItems,
    };
    setTransfers((prev) => [created, ...prev]);
    setExpanded(created.id);
    setFilterStatus('ALL');
    setCreateModalOpen(false);
    setNotice(`${created.transferCode} ${dispatchNow ? 'dispatched' : 'saved'}: ${draftTotal} units from ${newOrigin} to ${newDest}.`);
  }

  function exportCsv(list: StockTransfer[]) {
    setMenuFor(null);
    const header = ['Transfer', 'Status', 'From', 'To', 'Carrier', 'Tracking', 'Created', 'Dispatched', 'Received', 'SKU', 'Product', 'Cartons', 'Units/carton', 'Loose', 'Total units'];
    const rows = list.flatMap((t) => t.items.map((i) => [t.transferCode, STATUS_META[t.status].label, t.sourceLocation, t.destLocation, t.carrier, t.trackingNumber, t.createdAt, t.dispatchedAt ?? '', t.receivedAt ?? '', i.sku, i.name, i.cartons, i.unitsPerCarton, i.looseUnits, i.totalUnits]));
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = list.length === 1 ? `${list[0].transferCode}.csv` : `transfers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`Exported ${list.length} transfer${list.length === 1 ? '' : 's'} to CSV.`);
  }

  async function copyTracking(t: StockTransfer) {
    setMenuFor(null);
    try { await navigator.clipboard.writeText(t.trackingNumber); setNotice(`Tracking number ${t.trackingNumber} copied.`); }
    catch { setNotice(`Tracking number: ${t.trackingNumber}`); }
  }

  async function runBenchRequest(e: FormEvent) {
    e.preventDefault();
    setBenchBusy(true);
    setBenchResponse('');
    setBenchStatus(null);
    try {
      const session = getStoredSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
      const res = await fetch(`${API_BASE}${path}`, { method, headers, body: method !== 'GET' && benchBody ? benchBody : undefined });
      setBenchStatus(res.status);
      const text = await res.text();
      try { setBenchResponse(JSON.stringify(JSON.parse(text), null, 2)); } catch { setBenchResponse(text || '(empty response)'); }
    } catch (caught) {
      setBenchResponse(`Error: ${caught instanceof Error ? caught.message : 'Request failed'}`);
    } finally {
      setBenchBusy(false);
    }
  }

  const statusTabs: Array<{ key: StatusFilter; label: string }> = [
    { key: 'ALL', label: 'All' },
    { key: 'PENDING_DISPATCH', label: 'Awaiting dispatch' },
    { key: 'IN_TRANSIT', label: 'In transit' },
    { key: 'RECEIVED', label: 'Received' },
  ];

  const receiveTotal = receivingTransfer ? unitsOf(receivingTransfer) : 0;
  const receiveGood = Math.max(0, receiveTotal - damagedUnits - missingUnits);

  const Stepper = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <span className={styles.stepper}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 0} aria-label={`Less ${label}`}><Icon name="minus" size={13} /></button>
      <input type="number" min="0" value={value} onChange={(e) => onChange(Math.floor(Number(e.target.value) || 0))} aria-label={label} />
      <button type="button" onClick={() => onChange(value + 1)} aria-label={`More ${label}`}><Icon name="plus" size={13} /></button>
    </span>
  );

  return (
    <div className={styles.page}>
      {/* ---------- Header (same pattern as Products / Reports) ---------- */}
      <header className={styles.header}>
        <div>
          <h1>Transfers &amp; Logistics</h1>
          <p>Send stock between locations, follow it on the road and receive it into inventory.</p>
        </div>
        <button type="button" className={styles.primaryButton} onClick={openCreate}><Icon name="plus" size={16} /> New transfer</button>
      </header>

      {notice && (
        <div className={styles.notice} role="status">
          <Icon name="check" size={16} /><span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      )}

      {/* ---------- Summary cards ---------- */}
      <section className={styles.summaryGrid} aria-label="Transfer summary">
        <button type="button" className={`${styles.summaryCard} ${filterStatus === 'PENDING_DISPATCH' ? styles.summaryOn : ''}`} onClick={() => setFilterStatus(filterStatus === 'PENDING_DISPATCH' ? 'ALL' : 'PENDING_DISPATCH')}>
          <div className={styles.summaryTop}><span>Awaiting dispatch</span><i className={styles.toneAmber}><Icon name="clock" size={16} /></i></div>
          <strong className={styles.summaryValue}>{kpis.pending}</strong>
          <span className={styles.summaryFoot}><b className={`${styles.chip} ${styles.chipAmber}`}>{kpis.pendingUnits} units</b> ready to send</span>
        </button>
        <button type="button" className={`${styles.summaryCard} ${styles.summaryBlue} ${filterStatus === 'IN_TRANSIT' ? styles.summaryOn : ''}`} onClick={() => setFilterStatus(filterStatus === 'IN_TRANSIT' ? 'ALL' : 'IN_TRANSIT')}>
          <div className={styles.summaryTop}><span>In transit</span><i><Icon name="truck" size={16} /></i></div>
          <strong className={styles.summaryValue}>{kpis.inTransit}</strong>
          <span className={styles.summaryFoot}><b className={`${styles.chip} ${styles.chipBlue}`}>{kpis.inTransitUnits} units</b> on the road</span>
        </button>
        <button type="button" className={`${styles.summaryCard} ${filterStatus === 'RECEIVED' ? styles.summaryOn : ''}`} onClick={() => setFilterStatus(filterStatus === 'RECEIVED' ? 'ALL' : 'RECEIVED')}>
          <div className={styles.summaryTop}><span>Received</span><i className={styles.toneGreen}><Icon name="check" size={16} /></i></div>
          <strong className={styles.summaryValue}>{kpis.received}</strong>
          <span className={styles.summaryFoot}>{kpis.withIssues ? <b className={`${styles.chip} ${styles.chipRed}`}>{kpis.withIssues} with issues</b> : <b className={`${styles.chip} ${styles.chipGreen}`}>No issues</b>} after checking</span>
        </button>
        <div className={styles.summaryCard}>
          <div className={styles.summaryTop}><span>Units not yet received</span><i><Icon name="box" size={16} /></i></div>
          <strong className={styles.summaryValue}>{kpis.openUnits.toLocaleString('en-IN')}</strong>
          <span className={styles.summaryFoot}><b className={styles.chip}>{kpis.pending + kpis.inTransit} open transfers</b></span>
        </div>
      </section>

      {/* ---------- Transfers table ---------- */}
      <section className={styles.tableCard}>
        <div className={styles.tableTop}>
          <div className={styles.tabs} role="tablist" aria-label="Filter by status">
            {statusTabs.map((tab) => (
              <button key={tab.key} type="button" role="tab" aria-selected={filterStatus === tab.key} className={filterStatus === tab.key ? styles.tabOn : ''} onClick={() => setFilterStatus(tab.key)}>
                {tab.label}<span>{count(tab.key)}</span>
              </button>
            ))}
          </div>
          <div className={styles.tableTools}>
            <label className={styles.search}>
              <Icon name="search" size={15} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search transfers or products…" aria-label="Search transfers" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><Icon name="x" size={12} /></button>}
            </label>
            {/* Route filters: where stock leaves from and where it goes to */}
            <div className={styles.routeFilter} role="group" aria-label="Filter by route">
              <PillDropdown<string>
                value={fromFilter}
                heading="Sent from"
                ariaLabel="Filter by origin"
                icon={<Icon name={fromFilter !== 'ALL' && isWarehouse(fromFilter) ? 'warehouse' : 'store'} size={14} />}
                buttonLabel={fromFilter === 'ALL' ? 'From: any' : `From: ${fromFilter}`}
                options={[{ value: 'ALL', label: 'Any location' }, ...LOCATIONS.map((l) => ({ value: l, label: l }))]}
                onChange={(v) => { setFromFilter(v); if (v !== 'ALL' && v === toFilter) setToFilter('ALL'); }}
              />
              <button type="button" className={styles.swapButton} onClick={() => { setFromFilter(toFilter); setToFilter(fromFilter); }} disabled={fromFilter === 'ALL' && toFilter === 'ALL'} title="Swap From and To" aria-label="Swap From and To filters"><Icon name="swap" size={14} /></button>
              <PillDropdown<string>
                value={toFilter}
                heading="Sent to"
                ariaLabel="Filter by destination"
                icon={<Icon name={toFilter !== 'ALL' && isWarehouse(toFilter) ? 'warehouse' : 'store'} size={14} />}
                buttonLabel={toFilter === 'ALL' ? 'To: any' : `To: ${toFilter}`}
                options={[{ value: 'ALL', label: 'Any location' }, ...LOCATIONS.filter((l) => l !== fromFilter).map((l) => ({ value: l, label: l }))]}
                onChange={setToFilter}
              />
            </div>
            <PillDropdown<SortKey>
              value={sortKey}
              heading="Sort by"
              ariaLabel="Sort transfers"
              icon={<Icon name="sort" size={14} />}
              options={[{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'units', label: 'Most units' }]}
              onChange={setSortKey}
            />
            <button type="button" className={styles.iconButton} onClick={() => exportCsv(filteredTransfers)} disabled={!filteredTransfers.length} title="Export to CSV" aria-label="Export to CSV"><Icon name="download" size={16} /></button>
          </div>
        </div>

        <div className={styles.headRow}>
          <span>Transfer</span><span>Route</span><span className={styles.right}>Items</span><span>Status</span><span />
        </div>

        <ul className={styles.rows}>
          {filteredTransfers.map((t) => {
            const meta = STATUS_META[t.status];
            const isOpen = expanded === t.id;
            const issues = hasIssues(t);
            const created = splitStamp(t.createdAt);
            return (
              <Fragment key={t.id}>
                <li className={`${styles.row} ${isOpen ? styles.rowOpen : ''}`}>
                  <button type="button" className={styles.rowMain} onClick={() => setExpanded(isOpen ? null : t.id)} aria-expanded={isOpen}>
                    <span className={`${styles.rowIcon} ${styles[`icon_${issues ? 'issue' : meta.tone}`]}`}><Icon name={t.status === 'RECEIVED' ? 'inbox' : t.status === 'IN_TRANSIT' ? 'truck' : 'clock'} size={17} /></span>
                    <span className={styles.rowTitle}>
                      <strong>{t.transferCode}</strong>
                      <small>{created.day} · {created.time}</small>
                    </span>
                  </button>

                  <span className={styles.route}>
                    <span><Icon name={isWarehouse(t.sourceLocation) ? 'warehouse' : 'store'} size={14} />{t.sourceLocation}</span>
                    <i><Icon name="arrow" size={13} /></i>
                    <span><Icon name={isWarehouse(t.destLocation) ? 'warehouse' : 'store'} size={14} />{t.destLocation}</span>
                  </span>

                  <span className={`${styles.items} ${styles.right}`}>
                    <strong>{unitsOf(t)} units</strong>
                    <small>{t.items.length} product{t.items.length === 1 ? '' : 's'} · {cartonsOf(t)} cartons</small>
                  </span>

                  <span><span className={`${styles.status} ${styles[issues ? 'issue' : meta.tone]}`}><i />{issues ? 'Received · issues' : meta.label}</span></span>

                  <span className={styles.rowActions}>
                    {t.status === 'IN_TRANSIT' && <button type="button" className={styles.actionButton} onClick={() => openReceive(t)}>Receive</button>}
                    {t.status === 'PENDING_DISPATCH' && <button type="button" className={styles.actionButton} onClick={() => dispatchTransfer(t)}>Dispatch</button>}
                    <span className={styles.menuWrap} data-row-menu>
                      <button type="button" className={`${styles.moreButton} ${menuFor === t.id ? styles.moreOn : ''}`} onClick={() => setMenuFor(menuFor === t.id ? null : t.id)} aria-haspopup="menu" aria-expanded={menuFor === t.id} aria-label={`Options for ${t.transferCode}`}><Icon name="more" size={16} /></button>
                      {menuFor === t.id && (
                        <div className={styles.menu} role="menu">
                          <div className={styles.menuHeading}>{t.transferCode}</div>
                          <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setExpanded(isOpen ? null : t.id); }}><Icon name="eye" size={15} /><span><b>{isOpen ? 'Hide details' : 'View details'}</b><small>Products, timeline and notes</small></span></button>
                          {t.status === 'PENDING_DISPATCH' && <button type="button" role="menuitem" onClick={() => dispatchTransfer(t)}><Icon name="send" size={15} /><span><b>Dispatch now</b><small>Mark as on the road</small></span></button>}
                          {t.status === 'IN_TRANSIT' && <button type="button" role="menuitem" onClick={() => openReceive(t)}><Icon name="inbox" size={15} /><span><b>Receive stock</b><small>Check and add to inventory</small></span></button>}
                          <button type="button" role="menuitem" onClick={() => copyTracking(t)}><Icon name="copy" size={15} /><span><b>Copy tracking number</b><small>{t.trackingNumber}</small></span></button>
                          <div className={styles.menuDivider} />
                          <button type="button" role="menuitem" onClick={() => exportCsv([t])}><Icon name="download" size={15} /><span><b>Download as CSV</b><small>This transfer only</small></span></button>
                        </div>
                      )}
                    </span>
                    <button type="button" className={`${styles.expand} ${isOpen ? styles.expandOn : ''}`} onClick={() => setExpanded(isOpen ? null : t.id)} aria-label={isOpen ? 'Hide details' : 'Show details'}><Icon name="chevron" size={15} /></button>
                  </span>
                </li>

                {isOpen && (
                  <li className={styles.detail}>
                    <div className={styles.detailItems}>
                      <div className={styles.detailHead}><span>Product</span><span>Cartons</span><span>Loose</span><span className={styles.right}>Units</span></div>
                      {t.items.map((i) => (
                        <div key={i.sku} className={styles.detailLine}>
                          <span className={styles.lineName}><span className={styles.lineThumb}><Icon name="box" size={15} /></span><span><strong>{i.name}</strong><small>{i.sku} · {i.unitsPerCarton} per carton</small></span></span>
                          <span>{i.cartons}</span>
                          <span>{i.looseUnits}</span>
                          <b className={styles.right}>{i.totalUnits}</b>
                        </div>
                      ))}
                      <div className={styles.detailTotal}><span>Total</span><span>{cartonsOf(t)}</span><span>{t.items.reduce((s, i) => s + i.looseUnits, 0)}</span><b className={styles.right}>{unitsOf(t)}</b></div>
                    </div>

                    <div className={styles.detailSide}>
                      <ol className={styles.timeline}>
                        <li className={styles.done}><i /><span><strong>Created</strong><small>{t.createdAt}</small></span></li>
                        <li className={t.dispatchedAt ? styles.done : styles.next}><i /><span><strong>Dispatched</strong><small>{t.dispatchedAt ?? 'Waiting to be sent'}</small></span></li>
                        <li className={t.receivedAt ? (issues ? styles.warn : styles.done) : t.dispatchedAt ? styles.next : ''}><i /><span><strong>Received</strong><small>{t.receivedAt ?? (t.dispatchedAt ? 'On the way' : '—')}</small></span></li>
                      </ol>
                      <div className={styles.facts}>
                        <span><small>Carrier</small><b>{t.carrier}</b></span>
                        <span><small>Tracking</small><b className={styles.mono}>{t.trackingNumber}</b></span>
                      </div>
                      {t.receipt && (
                        <div className={styles.receipt}>
                          <span><small>Good</small><b>{t.receipt.good}</b></span>
                          <span><small>Damaged</small><b className={t.receipt.damaged ? styles.warnText : ''}>{t.receipt.damaged}</b></span>
                          <span><small>Missing</small><b className={t.receipt.missing ? styles.badText : ''}>{t.receipt.missing}</b></span>
                        </div>
                      )}
                      <p className={styles.note}>{t.notes}</p>
                    </div>
                  </li>
                )}
              </Fragment>
            );
          })}
        </ul>

        {!filteredTransfers.length && (
          <div className={styles.empty}>
            <span><Icon name="truck" size={26} /></span>
            <strong>No transfers found</strong>
            <p>Try another status, location or search.</p>
            <button type="button" className={styles.ghostButton} onClick={() => { setFilterStatus('ALL'); setLocationFilter('ALL'); setFromFilter('ALL'); setToFilter('ALL'); setSearch(''); }}>Clear filters</button>
          </div>
        )}

        <footer className={styles.tableFoot}>
          <span>Showing <b>{filteredTransfers.length}</b> of <b>{scoped.length}</b> transfers</span>
          <span>{filteredTransfers.reduce((s, t) => s + unitsOf(t), 0).toLocaleString('en-IN')} units</span>
        </footer>
      </section>

      {/* ---------- API console (developer tool, collapsed) ---------- */}
      <details className={styles.devTools}>
        <summary><span><Icon name="code" size={15} /> Developer tools · API console</span><Icon name="chevron" size={15} /></summary>
        <div className={styles.devBody}>
          <form onSubmit={runBenchRequest} className={styles.benchForm}>
            <div className={styles.benchRow}>
              <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} aria-label="HTTP method">
                <option>GET</option><option>POST</option><option>PATCH</option>
              </select>
              <span className={styles.benchBase}>{API_BASE}</span>
              <input type="text" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/health/readiness" aria-label="Request path" />
              <button type="submit" disabled={benchBusy} className={styles.smallPrimary}><Icon name="send" size={14} /> {benchBusy ? 'Sending…' : 'Send'}</button>
            </div>
            {method !== 'GET' && <textarea rows={4} value={benchBody} onChange={(e) => setBenchBody(e.target.value)} placeholder='{ "key": "value" }' aria-label="Request body" />}
          </form>
          {(benchResponse || benchStatus !== null) && (
            <div className={styles.benchOut}>
              <div className={styles.benchOutHead}><span>Response</span>{benchStatus !== null && <b className={benchStatus < 400 ? styles.okCode : styles.errCode}>{benchStatus}</b>}</div>
              <pre>{benchResponse}</pre>
            </div>
          )}
        </div>
      </details>

      {/* ---------- Receive modal ---------- */}
      {receivingTransfer && (
        <div className={styles.backdrop} onClick={() => setReceivingTransfer(null)}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="receive-title" onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <span className={`${styles.modalIcon} ${styles.icon_transit}`}><Icon name="inbox" size={18} /></span>
              <div>
                <h2 id="receive-title">Receive {receivingTransfer.transferCode}</h2>
                <p>{receivingTransfer.sourceLocation} → {receivingTransfer.destLocation}</p>
              </div>
              <button type="button" className={styles.modalClose} onClick={() => setReceivingTransfer(null)} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <form onSubmit={handleReceiveConfirm}>
              <div className={styles.modalBody}>
                <div className={styles.manifest}>
                  {receivingTransfer.items.map((i) => (
                    <div key={i.sku}><span>{i.name}<small>{i.sku}</small></span><b>{i.totalUnits}</b></div>
                  ))}
                </div>

                <div className={styles.receiveGrid}>
                  <div className={styles.receiveBox}><small>Expected</small><b>{receiveTotal}</b></div>
                  <div className={styles.receiveBox}><small>Damaged</small><Stepper value={damagedUnits} onChange={(v) => setDamagedUnits(Math.max(0, v))} label="damaged units" /></div>
                  <div className={styles.receiveBox}><small>Missing</small><Stepper value={missingUnits} onChange={(v) => setMissingUnits(Math.max(0, v))} label="missing units" /></div>
                  <div className={`${styles.receiveBox} ${styles.receiveGood}`}><small>Into stock</small><b>{receiveGood}</b></div>
                </div>

                <label className={styles.field}><span>Note</span><textarea rows={2} value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} placeholder="e.g. 1 carton crushed, 2 units missing" /></label>
                {receiveError && <p className={styles.formError}><Icon name="alert" size={14} /> {receiveError}</p>}
              </div>
              <div className={styles.modalFoot}>
                <button type="button" className={styles.ghostButton} onClick={() => setReceivingTransfer(null)}>Cancel</button>
                <button type="submit" disabled={isReceivingBusy} className={styles.primaryButton}><Icon name="check" size={15} /> {isReceivingBusy ? 'Saving…' : 'Confirm receipt'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------- Create modal: option cards instead of dropdowns ---------- */}
      {createModalOpen && (
        <div className={styles.backdrop} onClick={() => setCreateModalOpen(false)}>
          <div className={`${styles.modal} ${styles.modalWide}`} role="dialog" aria-modal="true" aria-labelledby="create-title" onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <span className={`${styles.modalIcon} ${styles.icon_transit}`}><Icon name="truck" size={18} /></span>
              <div>
                <h2 id="create-title">New transfer</h2>
                <p>Pick the route, the products and how it travels.</p>
              </div>
              <button type="button" className={styles.modalClose} onClick={() => setCreateModalOpen(false)} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <form onSubmit={handleCreateTransfer}>
              <div className={styles.modalBody}>
                {/* 1. Route */}
                <section className={styles.formSection}>
                  <h3><span>1</span> Route <em>Tap where stock leaves from, then where it goes. Any warehouse or store works.</em></h3>
                  <div className={styles.routeGrid}>
                    <div>
                      <small className={styles.groupLabel}>From</small>
                      <div className={styles.options}>
                        {LOCATIONS.map((l) => (
                          <button key={l} type="button" className={`${styles.option} ${newOrigin === l ? styles.optionOn : ''}`} onClick={() => { setNewOrigin(l); if (newDest === l) setNewDest(LOCATIONS.find((x) => x !== l) ?? ''); }} aria-pressed={newOrigin === l}>
                            <Icon name={isWarehouse(l) ? 'warehouse' : 'store'} size={15} />{l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button type="button" className={styles.routeArrow} onClick={() => { setNewOrigin(newDest); setNewDest(newOrigin); }} title="Swap From and To" aria-label="Swap From and To"><Icon name="swap" size={16} /></button>
                    <div>
                      <small className={styles.groupLabel}>To</small>
                      <div className={styles.options}>
                        {LOCATIONS.map((l) => (
                          <button key={l} type="button" className={`${styles.option} ${newDest === l ? styles.optionOn : ''}`} onClick={() => setNewDest(l)} disabled={l === newOrigin} aria-pressed={newDest === l}>
                            <Icon name={isWarehouse(l) ? 'warehouse' : 'store'} size={15} />{l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* 2. Products */}
                <section className={styles.formSection}>
                  <h3><span>2</span> Products <em>{draftItems.length ? `${draftItems.length} selected · ${draftTotal} units` : 'Tap to add'}</em></h3>
                  <div className={styles.productGrid}>
                    {CATALOG.map((p) => {
                      const q = draft[p.sku];
                      return (
                        <div key={p.sku} className={`${styles.productCard} ${q ? styles.productOn : ''}`}>
                          <button type="button" className={styles.productPick} onClick={() => toggleProduct(p.sku)} aria-pressed={!!q}>
                            <span className={styles.check}>{q && <Icon name="check" size={12} />}</span>
                            <span><strong>{p.name}</strong><small>{p.sku} · {p.unitsPerCarton} per carton</small></span>
                          </button>
                          {q && (
                            <div className={styles.productQty}>
                              <label><small>Cartons</small><Stepper value={q.cartons} onChange={(v) => setQty(p.sku, 'cartons', v)} label={`cartons of ${p.name}`} /></label>
                              <label><small>Loose</small><Stepper value={q.loose} onChange={(v) => setQty(p.sku, 'loose', v)} label={`loose units of ${p.name}`} /></label>
                              <span className={styles.qtyTotal}><small>Units</small><b>{q.cartons * p.unitsPerCarton + q.loose}</b></span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* 3. Delivery */}
                <section className={styles.formSection}>
                  <h3><span>3</span> Delivery</h3>
                  <div className={styles.carrierGrid}>
                    {CARRIERS.map((c) => (
                      <button key={c.name} type="button" className={`${styles.carrierOption} ${newCarrier === c.name ? styles.optionOn : ''}`} onClick={() => setNewCarrier(c.name)} aria-pressed={newCarrier === c.name}>
                        <strong>{c.name}</strong><small>{c.hint}</small>
                      </button>
                    ))}
                  </div>
                  <div className={styles.whenRow}>
                    <div className={styles.segmented} role="group" aria-label="When to send">
                      <button type="button" className={dispatchNow ? styles.segOn : ''} onClick={() => setDispatchNow(true)} aria-pressed={dispatchNow}><Icon name="send" size={14} /> Send now</button>
                      <button type="button" className={!dispatchNow ? styles.segOn : ''} onClick={() => setDispatchNow(false)} aria-pressed={!dispatchNow}><Icon name="clock" size={14} /> Save, send later</button>
                    </div>
                    <input className={styles.noteInput} value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Reason (optional), e.g. weekend restock" aria-label="Reason" />
                  </div>
                </section>
                {createError && <p className={styles.formError}><Icon name="alert" size={14} /> {createError}</p>}
              </div>
              <div className={styles.modalFoot}>
                <span className={styles.footSummary}>{draftTotal} units · {newOrigin} → {newDest}</span>
                <button type="button" className={styles.ghostButton} onClick={() => setCreateModalOpen(false)}>Cancel</button>
                <button type="submit" className={styles.primaryButton}><Icon name={dispatchNow ? 'send' : 'check'} size={15} /> {dispatchNow ? 'Create & send' : 'Save transfer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
