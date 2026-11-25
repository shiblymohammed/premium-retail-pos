'use client';

import { useAccess } from '@/lib/permissions';
import { ReasonDialog, type ReasonAction } from '@/components/admin/reason-dialog';
import { InfoHint } from '@/components/ui/info-hint';
import { Feedback } from '@/components/ui/feedback';
import {
  ArrowDownUp,
  ArrowLeftRight,
  ArrowRight,
  Barcode,
  Check,
  ChevronDown,
  Circle,
  Clock,
  Copy,
  Download,
  Ellipsis,
  Eye,
  Inbox,
  Minus,
  Package,
  Plus,
  Search,
  Send,
  Store,
  TriangleAlert,
  Truck,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import { PillDropdown } from '@/components/ui/pill-dropdown';
import styles from './operations.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type TransferStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PARTIALLY_DISPATCHED' | 'DISPATCHED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'REJECTED' | 'CANCELLED';

interface TransferItem {
  variantId: string;
  sku: string;
  name: string;
  baseUnit: string;
  cartons: number;
  unitsPerCarton: number;
  looseUnits: number;
  cartonRequired: boolean;
  totalUnits: number;
  requestedQtyBase: number;
  approvedQtyBase: number;
  dispatchedQtyBase: number;
  receivedQtyBase: number;
  shortQtyBase: number;
  damagedQtyBase: number;
}

interface ReceiptSummary {
  good: number;
  damaged: number;
  missing: number;
}

interface StockTransfer {
  id: string;
  sourceLocationId: string;
  destLocationId: string;
  requestedByUserId: string;
  requestedByName?: string;
  timezone?: string;
  auditLocked?: boolean;
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
interface ReplenishmentRequest {
  id: string;
  requestNumber: string;
  status: string;
  generatedByUserId: string;
  depotAuthorizedAt?: string | null;
  depotAuthorizedByUserId?: string | null;
  sourceLocation: { id: string; name: string; type: string };
  destLocation: { id: string; name: string; type: string };
  lines: Array<{ variantId: string; systemSuggestedQtyBase: number; managerApprovedQtyBase?: number | null; unitsPerCarton: number; variant?: { sku: string; name: string; product?: { name: string } } }>;
}

type LocationOption = { id: string; name: string; type: string; parentId: string | null };
type CatalogOption = { variantId: string; sku: string; name: string; baseUnit: string; unitsPerCarton: number };


const isReceiver = (role?: string) => role === 'STAFF' || role === 'CASHIER';
const outstandingQuantity = (item: TransferItem) => Math.max(0, item.dispatchedQtyBase - item.receivedQtyBase - item.shortQtyBase);

type StatusFilter = 'ALL' | 'PENDING' | 'TRANSIT' | 'RECEIVED';
type SortKey = 'newest' | 'oldest' | 'units';

const STATUS_META: Record<TransferStatus, { label: string; tone: string }> = {
  DRAFT: { label: 'Draft', tone: 'pending' },
  PENDING_APPROVAL: { label: 'Pending approval', tone: 'pending' },
  APPROVED: { label: 'Approved · awaiting dispatch', tone: 'pending' },
  PARTIALLY_DISPATCHED: { label: 'Partially dispatched', tone: 'transit' },
  DISPATCHED: { label: 'In transit', tone: 'transit' },
  PARTIALLY_RECEIVED: { label: 'Partially received', tone: 'transit' },
  RECEIVED: { label: 'Received', tone: 'received' },
  REJECTED: { label: 'Rejected', tone: 'rejected' },
  CANCELLED: { label: 'Cancelled', tone: 'rejected' },
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
function splitStamp(value: string, timeZone?: string) {
  if (value.includes('T')) {
    const date = new Date(value);
    return { day: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone }), time: date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone }) };
  }
  const [d, ...rest] = value.split(' ');
  return { day: d.split('-').slice(0, 2).join(' '), time: rest.join(' ') };
}
const unitsOf = (t: StockTransfer) => t.items.reduce((s, i) => s + i.totalUnits, 0);
const depotRequest = (request: ReplenishmentRequest) =>
  request.sourceLocation.type === 'MAIN_WAREHOUSE' && request.destLocation.type === 'SUB_WAREHOUSE';

function transferTime(date: string, timeZone?: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
}
const hasIssues = (t: StockTransfer) => !!t.receipt && t.receipt.damaged + t.receipt.missing > 0;
const isWarehouse = (loc: string) => /warehouse/i.test(loc);
const activeTransfer = (t: StockTransfer) => !['RECEIVED', 'REJECTED', 'CANCELLED'].includes(t.status);
const unitsInTransit = (t: StockTransfer) => activeTransfer(t) ? t.items.reduce((sum, item) => sum + outstandingQuantity(item), 0) : 0;
const pendingItemQuantity = (t: StockTransfer, item: TransferItem) => !activeTransfer(t) ? 0 :
  ['DRAFT', 'PENDING_APPROVAL'].includes(t.status) ? item.requestedQtyBase : Math.max(0, item.approvedQtyBase - item.dispatchedQtyBase);
const pendingUnits = (t: StockTransfer) => t.items.reduce((sum, item) => sum + pendingItemQuantity(t, item), 0);

const ICON_COMPONENTS: Partial<Record<string, LucideIcon>> = {
  search: Search,
  plus: Plus,
  minus: Minus,
  truck: Truck,
  box: Package,
  check: Check,
  clock: Clock,
  alert: TriangleAlert,
  chevron: ChevronDown,
  arrow: ArrowRight,
  warehouse: Warehouse,
  store: Store,
  x: X,
  download: Download,
  copy: Copy,
  code: Barcode,
  send: Send,
  sort: ArrowDownUp,
  swap: ArrowLeftRight,
  more: Ellipsis,
  eye: Eye,
  inbox: Inbox,
};

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const Glyph = ICON_COMPONENTS[name] ?? Circle;
  return <Glyph size={size} strokeWidth={1.9} aria-hidden="true" />;
}

type DraftQty = { cartons: number; loose: number };

export default function OperationsPage() {
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [replenishments, setReplenishments] = useState<ReplenishmentRequest[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [apiToken, setApiToken] = useState('');
  const [apiUserId, setApiUserId] = useState('');
  const [apiRole, setApiRole] = useState('');
  const [packing, setPacking] = useState<StockTransfer | null>(null);
  const [packingBalances, setPackingBalances] = useState<Record<string, number> | null>(null);
  const [replenishing, setReplenishing] = useState<ReplenishmentRequest | null>(null);
  const [lineQuantities, setLineQuantities] = useState<Record<string, number>>({});
  const [addedVariant, setAddedVariant] = useState('');
  const [isSavingLines, setIsSavingLines] = useState(false);
  const [lineError, setLineError] = useState('');
  const pendingKeys = useRef(new Map<string, string>());
  const { can } = useAccess(apiToken);
  const defaultManager = !isReceiver(apiRole) && apiRole !== 'INVENTORY';
  const canRequestTransfers = can('transfers.request', defaultManager || apiRole === 'INVENTORY');
  const canApproveTransfers = can('transfers.approve', defaultManager);
  const canDispatchTransfers = can('transfers.dispatch', defaultManager);
  const canReceiveTransfers = can('transfers.receive', apiRole !== 'INVENTORY');
  const receiveOnly = !canRequestTransfers && !canApproveTransfers && !canDispatchTransfers;

  const canActAt = (id: string) => apiRole === 'SUPER_ADMIN' || locations.some((location) => location.id === id);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [isCreatingBusy, setIsCreatingBusy] = useState(false);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL'); // selected location ID from the top bar
  const [fromFilter, setFromFilter] = useState('ALL');
  const [toFilter, setToFilter] = useState('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [notice, setNotice] = useState('');

  // Receive modal
  const [receivingTransfer, setReceivingTransfer] = useState<StockTransfer | null>(null);
  const [receiptIssues, setReceiptIssues] = useState<Record<string, { damaged: number; missing: number }>>({});
  const [receiveNotes, setReceiveNotes] = useState('');
  const [receiveError, setReceiveError] = useState('');
  const [isReceivingBusy, setIsReceivingBusy] = useState(false);

  // Create modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newOrigin, setNewOrigin] = useState('');
  const [newDest, setNewDest] = useState('');
  const [draft, setDraft] = useState<Record<string, DraftQty>>({});
  const [newNotes, setNewNotes] = useState('');
  const [dispatchNow, setDispatchNow] = useState(true);
  const [createError, setCreateError] = useState('');

  const locationName = (id: string) => locations.find((location) => location.id === id)?.name ?? id;

  const normalizeTransfer = (row: any): StockTransfer => {
    const items: TransferItem[] = (row.lines || []).map((line: any) => {
      const unitsPerCarton = Number(line.unitsPerCarton || 1);
      const requestedQtyBase = Number(line.requestedQtyBase || 0);
      const dispatchedQtyBase = Number(line.dispatchedQtyBase || 0);
      const availableQty = Number(line.receivedQtyBase || 0);
      const variant = line.variant || {};
      return {
        variantId: line.variantId,
        sku: variant.sku || line.variantId,
        name: variant.product?.name || variant.name || variant.sku || 'Product',
        baseUnit: line.baseUnitSnapshot ?? variant.product?.baseUnit ?? 'unit',
        cartons: unitsPerCarton > 1 ? Math.floor(requestedQtyBase / unitsPerCarton) : 0,
        unitsPerCarton,
        looseUnits: unitsPerCarton > 1 ? requestedQtyBase % unitsPerCarton : requestedQtyBase,
        cartonRequired: !!line.cartonRequired,
        totalUnits: requestedQtyBase,
        requestedQtyBase,
        approvedQtyBase: Number(line.approvedQtyBase ?? requestedQtyBase),
        dispatchedQtyBase,
        receivedQtyBase: availableQty,
        shortQtyBase: Number(line.shortQtyBase || 0),
        damagedQtyBase: Number(line.damagedQtyBase || 0),
      };
    });
    const damaged = items.reduce((sum, item) => sum + item.damagedQtyBase, 0);
    const missing = items.reduce((sum, item) => sum + item.shortQtyBase, 0);
    return {
      id: row.id,
      sourceLocationId: row.sourceLocationId,
      destLocationId: row.destLocationId,
      requestedByUserId: row.requestedByUserId,
      requestedByName: row.requestedBy?.employee ? `${row.requestedBy.employee.firstName} ${row.requestedBy.employee.lastName}` : row.requestedBy?.email,
      transferCode: row.transferNumber,
      sourceLocation: row.sourceLocation?.name || row.sourceLocationId,
      destLocation: row.destLocation?.name || row.destLocationId,
      timezone: row.destLocation?.company?.timezone,
      auditLocked: Boolean(row.sourceLocation?.isAuditLocked || row.destLocation?.isAuditLocked),
      status: row.status,
      createdAt: row.createdAt,
      dispatchedAt: row.dispatchedAt,
      receivedAt: row.receivedAt,
      carrier: '—',
      trackingNumber: '—',
      notes: row.notes || '',
      items,
      receipt: row.receivedAt ? { good: items.reduce((sum, item) => sum + Math.max(0, item.receivedQtyBase - item.damagedQtyBase), 0), damaged, missing } : undefined,
    };
  };

  const reloadOperations = async (token = apiToken, role = apiRole) => {
    if (!token) { setLoading(false); return; }
    const headers = { Authorization: `Bearer ${token}` };
    const load = (path: string) => fetch(`${API_BASE}${path}`, { headers, cache: 'no-store' });
    const empty = () => Promise.resolve(new Response('{"data":[]}'));
    const [transferRes, locationRes, productRes, replenishmentRes] = await Promise.all([
      load('/transfers'), load('/locations?isActive=true'),
      isReceiver(role) ? empty() : load('/products?isActive=true'),
      isReceiver(role) ? empty() : load('/transfers/replenishment'),
    ]);
    const [transferBody, locationBody, productBody, replenishmentBody] = await Promise.all([
      transferRes.json().catch(() => ({})), locationRes.json().catch(() => ({})), productRes.json().catch(() => ({})), replenishmentRes.json().catch(() => ({})),
    ]);
    const failed = [transferRes, locationRes, productRes, replenishmentRes].find((response) => !response.ok);
    if (failed) throw new Error([transferBody, locationBody, productBody, replenishmentBody][[transferRes, locationRes, productRes, replenishmentRes].indexOf(failed)]?.message || 'Could not load transfer data from the API.');
    const nextLocations: LocationOption[] = Array.isArray(locationBody.data)
      ? locationBody.data.filter((item: any) => item && typeof item.id === 'string' && typeof item.name === 'string')
      : [];
    setLocations(nextLocations);
    setTransfers((Array.isArray(transferBody.data) ? transferBody.data : []).filter(Boolean).map(normalizeTransfer));
    const locationLabel = (relation: any, id: unknown) => {
      if (typeof relation?.name === 'string' && relation.name.trim()) return relation.name;
      const locationId = typeof id === 'string' ? id : typeof relation?.id === 'string' ? relation.id : '';
      return nextLocations.find((location) => location.id === locationId)?.name || (locationId ? `Location ${locationId.slice(0, 8)}` : 'Unknown location');
    };
    setReplenishments((Array.isArray(replenishmentBody.data) ? replenishmentBody.data : [])
      .filter((request: any) => request && typeof request === 'object')
      .map((request: any, index: number) => ({
        ...request,
        id: typeof request.id === 'string' ? request.id : `replenishment-${index}`,
        requestNumber: typeof request.requestNumber === 'string' ? request.requestNumber : 'Replenishment request',
        status: typeof request.status === 'string' ? request.status : 'DRAFT',
        generatedByUserId: typeof request.generatedByUserId === 'string' ? request.generatedByUserId : '',
        sourceLocation: {
          id: request.sourceLocation?.id || request.sourceLocationId || '',
          name: locationLabel(request.sourceLocation, request.sourceLocationId),
          type: request.sourceLocation?.type || '',
        },
        destLocation: {
          id: request.destLocation?.id || request.destLocationId || '',
          name: locationLabel(request.destLocation, request.destLocationId),
          type: request.destLocation?.type || '',
        },
        lines: Array.isArray(request.lines) ? request.lines : [],
      })));
    setCatalog((Array.isArray(productBody.data) ? productBody.data : []).filter(Boolean).flatMap((product: any) => (Array.isArray(product.variants) ? product.variants : []).filter((variant: any) => variant?.isActive).map((variant: any) => ({
      variantId: variant.id,
      sku: variant.sku,
      name: typeof product.name === 'string' && product.name.trim() ? product.name : variant.name || variant.sku || 'Product',
      baseUnit: product.baseUnit ?? 'unit',
      unitsPerCarton: Number(product.unitsPerCarton || 1),
    }))));
  };

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.accessToken) {
      setApiError('Sign in to view stock transfers.');
      setLoading(false);
      return;
    }
    setApiToken(session.accessToken);
    setApiUserId(session.user?.id || '');
    setApiRole(session.user?.role ?? '');
    reloadOperations(session.accessToken, session.user?.role).catch((error) => setApiError(error instanceof Error ? error.message : 'Could not load transfers.')).finally(() => setLoading(false));
  }, []);

  // Follow the store chosen in the top bar
  useEffect(() => {
    const apply = (value: string | null) => {
      if (!value || ['All retail locations', 'All locations'].includes(value)) { setLocationFilter('ALL'); return; }
      const location = locations.find((item) => item.id === value || item.name === value);
      setLocationFilter(location?.id || 'ALL');
    };
    apply(window.localStorage.getItem('premium-retail-location-scope'));
    const sync = (event: Event) => apply((event as CustomEvent<string>).detail);
    window.addEventListener('premium-retail-location-change', sync);
    return () => window.removeEventListener('premium-retail-location-change', sync);
  }, [locations]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash.startsWith('replenishment-') && replenishments.some((request) => hash === `replenishment-${request.id}`)) {
      document.getElementById(hash)?.scrollIntoView({ block: 'nearest' });
    }
  }, [replenishments]);

  // Escape closes modals / menus; clicking elsewhere closes the row menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!isReceivingBusy) setReceivingTransfer(null);
      if (!isSavingLines) { setPacking(null); setReplenishing(null); }
      setCreateModalOpen(false);
      setMenuFor(null);
    };
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-row-menu]')) setMenuFor(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick); };
  }, [isReceivingBusy, isSavingLines]);

  useEffect(() => {
    if (!packing || !apiToken) return;
    const controller = new AbortController();
    const pending = packing.items.filter((line) => line.approvedQtyBase > line.dispatchedQtyBase);

    async function readStock() {
      const balances: Record<string, number> = {};
      for (let index = 0; index < pending.length; index += 100) {
        const params = new URLSearchParams({
          locationId: packing!.sourceLocationId,
          stockState: 'AVAILABLE',
          variantIds: pending.slice(index, index + 100).map((item) => item.variantId).join(','),
        });
        const response = await fetch(`${API_BASE}/inventory/balances?${params}`, {
          headers: { Authorization: `Bearer ${apiToken}` }, cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('Stock availability could not be checked.');
        const payload = await response.json() as { data: Array<{ variantId: string; quantityBaseUnits: number }> };
        for (const row of payload.data) balances[row.variantId] = row.quantityBaseUnits;
      }
      if (!controller.signal.aborted) setPackingBalances(balances);
    }

    setPackingBalances(null);
    void readStock().catch(() => { /* Dispatch still checks current stock on the server. */ });
    return () => controller.abort();
  }, [packing, apiToken]);

  // Auto-hide notices
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const scoped = useMemo(
    () => transfers.filter((t) => locationFilter === 'ALL' || t.sourceLocationId === locationFilter || t.destLocationId === locationFilter),
    [transfers, locationFilter],
  );

  const filteredTransfers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = scoped.filter((t) => {
      const matchStatus = filterStatus === 'ALL' || (filterStatus === 'PENDING' ? (pendingUnits(t) > 0) : filterStatus === 'TRANSIT' ? (unitsInTransit(t) > 0) : t.status === 'RECEIVED');
      if ((fromFilter !== 'ALL' && t.sourceLocationId !== fromFilter) || (toFilter !== 'ALL' && t.destLocationId !== toFilter)) return false;
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
    const inTransit = scoped.filter((t) => (unitsInTransit(t) > 0));
    const pending = scoped.filter((t) => (pendingUnits(t) > 0));
    const received = scoped.filter((t) => t.status === 'RECEIVED');
    return {
      inTransit: inTransit.length,
      inTransitUnits: inTransit.reduce((s, t) => s + unitsInTransit(t), 0),
      pending: pending.length,
      pendingUnits: pending.reduce((s, t) => s + pendingUnits(t), 0),
      received: received.length,
      withIssues: received.filter(hasIssues).length,
      openTransfers: new Set([...pending, ...inTransit]).size,
      openUnits: scoped.reduce((s, t) => s + unitsInTransit(t) + pendingUnits(t), 0),
    };
  }, [scoped]);

  const count = (s: StatusFilter) => s === 'ALL' ? scoped.length : s === 'PENDING' ? scoped.filter((t) => (pendingUnits(t) > 0)).length : s === 'TRANSIT' ? scoped.filter((t) => (unitsInTransit(t) > 0)).length : scoped.filter((t) => t.status === 'RECEIVED').length;

  async function mutate(path: string, method: 'POST' | 'PATCH', body?: unknown) {
    if (!apiToken) throw new Error('Sign in before changing a transfer.');
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const signature = JSON.stringify([path, method, serialized]);
    const key = pendingKeys.current.get(signature) ?? crypto.randomUUID();
    pendingKeys.current.set(signature, key);
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: serialized,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status})`);
    pendingKeys.current.delete(signature);
    await reloadOperations().catch(() => setApiError('The change was saved. Retry to refresh the transfer list.'));
    return payload.data;
  }

  function openReceive(transfer: StockTransfer) {
    setMenuFor(null);
    setReceivingTransfer(transfer);
    setReceiptIssues({});
    setReceiveNotes('');
    setReceiveError('');
  }

  async function handleReceiveConfirm(event: FormEvent) {
    event.preventDefault();
    if (!receivingTransfer || isReceivingBusy) return;
    const lines = receivingTransfer.items.filter((item) => outstandingQuantity(item) > 0).map((item) => {
      const { damaged = 0, missing = 0 } = receiptIssues[item.variantId] ?? {};
      return { variantId: item.variantId, expected: outstandingQuantity(item), damaged, missing };
    });
    if (!lines.length || lines.some((line) => line.damaged + line.missing > line.expected)) {
      setReceiveError('Damaged and missing units cannot exceed the outstanding units on each product.');
      return;
    }
    if (lines.some((line) => line.damaged || line.missing) && !receiveNotes.trim()) {
      setReceiveError('Add a note to explain the discrepancy.');
      return;
    }
    setIsReceivingBusy(true);
    setReceiveError('');
    try {
      await mutate(`/transfers/${receivingTransfer.id}/receive`, 'POST', {
        lines: lines.map(({ variantId, expected, damaged, missing }) => ({
          variantId,
          receivedQtyBase: expected - missing,
          damagedQtyBase: damaged,
          ...(missing ? { shortQtyBase: missing, finalizeLine: true } : {}),
          ...((damaged || missing) ? { discrepancyNotes: receiveNotes.trim() } : {}),
        })),
      });
      setReceivingTransfer(null);
      setNotice('Receipt recorded. Inventory updated.');
    } catch (error) {
      setReceiveError(error instanceof Error ? error.message : 'Could not record receipt.');
    } finally {
      setIsReceivingBusy(false);
    }
  }

  function openPacking(transfer: StockTransfer) {
    setMenuFor(null);
    setLineError('');
    setLineQuantities({});
    setPacking(transfer);
  }

  async function confirmPacking(event: FormEvent) {
    event.preventDefault();
    if (!packing || isSavingLines) return;
    const lines = packing.items.filter((item) => lineQuantities[item.variantId] > 0).map((item) => ({
      variantId: item.variantId,
      ...(item.cartonRequired ? { cartons: lineQuantities[item.variantId] } : { looseBaseUnits: lineQuantities[item.variantId] }),
    }));
    if (!lines.length) { setLineError('Enter the quantity packed for at least one product.'); return; }
    setIsSavingLines(true);
    setLineError('');
    try {
      await mutate(`/transfers/${packing.id}/dispatch`, 'POST', { lines });
      setPacking(null);
      setNotice('Packed quantities dispatched. Any approved balance remains open.');
    } catch (error) {
      setLineError(error instanceof Error ? error.message : 'Could not dispatch this transfer.');
    } finally {
      setIsSavingLines(false);
    }
  }

  async function submitTransfer(t: StockTransfer) {
    setMenuFor(null);
    try { await mutate(`/transfers/${t.id}/submit`, 'POST'); setNotice('Transfer submitted for approval.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not submit this transfer.'); }
  }

  async function approveTransfer(t: StockTransfer) {
    setMenuFor(null);
    try {
      await mutate(`/transfers/${t.id}/approve`, 'POST', { lines: t.items.map((item) => ({ variantId: item.variantId, approvedQtyBase: item.requestedQtyBase })) });
      setNotice('Transfer approved by the server.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not approve this transfer.'); }
  }

  async function rejectTransfer(t: StockTransfer, reason: string) {
    setMenuFor(null);
    try { await mutate(`/transfers/${t.id}/reject`, 'POST', { reason }); setNotice(`Transfer ${t.transferCode} rejected.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not reject this transfer.'); }
  }

  async function cancelTransfer(t: StockTransfer, reason: string) {
    setMenuFor(null);
    try { await mutate(`/transfers/${t.id}/cancel`, 'PATCH', { reason }); setNotice(`Transfer ${t.transferCode} cancelled; inventory adjustments were recorded by the server.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not cancel this transfer.'); }
  }

  async function generateReplenishment() {
    if (locationFilter === 'ALL') { setNotice('Choose a destination in the location selector first.'); return; }
    try {
      const request = await mutate('/transfers/replenishment/generate', 'POST', { destLocationId: locationFilter });
      setNotice(request?.id ? `Replenishment request ${request.requestNumber} created for manager review.` : 'No replenishment is needed for the selected location.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not generate replenishment.'); }
  }

  function openReplenishment(request: ReplenishmentRequest) {
    setLineQuantities(Object.fromEntries(request.lines.map((line) => [
      line.variantId, (request.depotAuthorizedAt ? line.managerApprovedQtyBase ?? 0 : line.systemSuggestedQtyBase) / Math.max(1, line.unitsPerCarton || 1),
    ])));
    setAddedVariant('');
    setLineError('');
    setReplenishing(request);
  }

  async function approveReplenishment(event: FormEvent) {
    event.preventDefault();
    if (!replenishing || isSavingLines) return;
    const lines = Object.entries(lineQuantities).map(([variantId, quantity]) => {
      const ratio = replenishing.lines.find((line) => line.variantId === variantId)?.unitsPerCarton
        ?? catalog.find((variant) => variant.variantId === variantId)?.unitsPerCarton ?? 1;
      return { variantId, approvedQtyBase: quantity * Math.max(1, ratio) };
    });
    if (!lines.some((line) => line.approvedQtyBase > 0)) { setLineError('Approve a quantity for at least one product.'); return; }
    setIsSavingLines(true);
    setLineError('');
    try {
      const signOff = depotRequest(replenishing) && !replenishing.depotAuthorizedAt;
      await mutate(`/transfers/replenishment/${replenishing.id}/${signOff ? 'depot-sign-off' : 'approve'}`, 'POST', { lines });
      setReplenishing(null);
      setNotice(signOff ? `Depot authorized ${replenishing.requestNumber} for main warehouse release.`
        : depotRequest(replenishing) ? `Replenishment ${replenishing.requestNumber} released for packing.`
        : `Replenishment ${replenishing.requestNumber} approved and transfer draft created.`);
    } catch (error) {
      setLineError(error instanceof Error ? error.message : 'Could not approve replenishment.');
    } finally {
      setIsSavingLines(false);
    }
  }

  async function rejectReplenishment(request: ReplenishmentRequest, reason: string) {
    try {
      await mutate(`/transfers/replenishment/${request.id}/reject`, 'POST', { reason });
      setNotice(`Replenishment ${request.requestNumber} rejected.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not reject replenishment.'); }
  }

  function openCreate() {
    // Start from the route filters if set, otherwise warehouse → the store chosen in the top bar
    const origin = fromFilter !== 'ALL' ? fromFilter : '';
    const fallbackDest = locationFilter !== 'ALL' && locationFilter !== origin ? locationFilter : '';
    setNewOrigin(origin);
    setNewDest(toFilter !== 'ALL' && toFilter !== origin ? toFilter : fallbackDest);
    setDraft({});
    setNewNotes('');
    setDispatchNow(true);
    setCreateError('');
    setCreateModalOpen(true);
  }

  const draftItems: TransferItem[] = catalog.filter((p) => draft[p.sku]).map((p) => {
    const q = draft[p.sku];
    const loose = p.unitsPerCarton > 1 ? 0 : q.loose;
    const totalUnits = q.cartons * p.unitsPerCarton + loose;
    return { variantId: p.variantId, sku: p.sku, name: p.name, baseUnit: p.baseUnit, cartons: q.cartons, unitsPerCarton: p.unitsPerCarton, looseUnits: loose, cartonRequired: p.unitsPerCarton > 1, totalUnits, requestedQtyBase: totalUnits, approvedQtyBase: 0, dispatchedQtyBase: 0, receivedQtyBase: 0, shortQtyBase: 0, damagedQtyBase: 0 };
  });
  const draftTotal = draftItems.reduce((s, i) => s + i.totalUnits, 0);
  const setQty = (sku: string, key: keyof DraftQty, value: number) => setDraft((d) => ({ ...d, [sku]: { ...d[sku], [key]: Math.max(0, value) } }));
  const toggleProduct = (sku: string) => setDraft((d) => {
    const next = { ...d };
    if (next[sku]) delete next[sku]; else { const packed = (catalog.find((variant) => variant.sku === sku)?.unitsPerCarton ?? 1) > 1; next[sku] = { cartons: packed ? 1 : 0, loose: packed ? 0 : 1 }; }
    return next;
  });

  async function handleCreateTransfer(e: FormEvent) {
    e.preventDefault();
    if (newOrigin === newDest) { setCreateError('Pick a different destination.'); return; }
    if (!draftItems.length) { setCreateError('Choose at least one product to send.'); return; }
    if (draftItems.some((i) => i.totalUnits <= 0)) { setCreateError('Each product needs at least one carton or loose unit.'); return; }

    setIsCreatingBusy(true);
    try {
      const created = await mutate('/transfers', 'POST', {
        sourceLocationId: newOrigin,
        destLocationId: newDest,
        notes: newNotes.trim() || undefined,
        lines: draftItems.map((item) => ({ variantId: item.variantId, cartons: item.cartons, looseBaseUnits: item.looseUnits })),
      });
      if (dispatchNow && created?.id) {
        await mutate(`/transfers/${created.id}/submit`, 'POST');
        setNotice('Transfer created and submitted for approval.');
      } else setNotice('Transfer draft saved. Submit it when ready for approval.');
      setCreateModalOpen(false);
    } catch (error) { setCreateError(error instanceof Error ? error.message : 'Transfer could not be saved.'); }
    finally { setIsCreatingBusy(false); }
  }

  function exportCsv(list: StockTransfer[]) {
    setMenuFor(null);
    const header = ['Transfer', 'Status', 'From', 'To', 'Carrier', 'Tracking', 'Created', 'Dispatched', 'Received', 'SKU', 'Product', 'Requested cartons', 'Units/carton', 'Requested loose', 'Requested units', 'Approved units', 'Packed units', 'In transit', 'Awaiting packing / approval', 'Received good', 'Damaged', 'Missing'];
    const rows = list.flatMap((t) => t.items.map((i) => [t.transferCode, STATUS_META[t.status].label, t.sourceLocation, t.destLocation, t.carrier, t.trackingNumber, t.createdAt, t.dispatchedAt ?? '', t.receivedAt ?? '', i.sku, i.name, i.cartons, i.unitsPerCarton, i.looseUnits, i.requestedQtyBase, i.approvedQtyBase, i.dispatchedQtyBase, activeTransfer(t) ? outstandingQuantity(i) : 0, pendingItemQuantity(t, i), i.receivedQtyBase - i.damagedQtyBase, i.damagedQtyBase, i.shortQtyBase]));
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

  const statusTabs: Array<{ key: StatusFilter; label: string }> = [
    { key: 'ALL', label: 'All' },
    { key: 'PENDING', label: 'Needs action' },
    { key: 'TRANSIT', label: 'In transit' },
    { key: 'RECEIVED', label: 'Received' },
  ];



  const Stepper = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <span className={styles.stepper}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 0} aria-label={`Less ${label}`}><Icon name="minus" size={13} /></button>
      <input type="number" min="0" value={value} onChange={(e) => onChange(Math.floor(Number(e.target.value) || 0))} aria-label={label} />
      <button type="button" onClick={() => onChange(value + 1)} aria-label={`More ${label}`}><Icon name="plus" size={13} /></button>
    </span>
  );

  return (
    <div className={`${styles.page} app-page`}>
      {/* ---------- Header (same pattern as Products / Reports) ---------- */}
      <header className={styles.header}>
        <div>
          <h1>{receiveOnly ? 'Incoming deliveries' : 'Transfers & Logistics'}</h1>
          <p>{receiveOnly ? 'Check and receive stock at your assigned store.' : 'Send stock between locations, follow it on the road and receive it into inventory.'}</p>
        </div>
        {!receiveOnly && <div className={styles.headerActions}>
          <button type="button" className={styles.ghostButton} onClick={generateReplenishment} disabled={!canRequestTransfers || !apiToken || locationFilter === 'ALL'}>Generate replenishment</button>
          <button type="button" className={styles.primaryButton} onClick={openCreate} disabled={!canRequestTransfers || !apiToken || locations.length < 2 || !catalog.length}><Icon name="plus" size={16} /> New transfer</button>
        </div>}
      </header>

      {apiError && <div className={styles.notice} role="alert"><Icon name="alert" size={16} /><span>{apiError}</span><button type="button" onClick={() => { setLoading(true); reloadOperations().then(() => setApiError('')).catch((error) => setApiError(error.message)).finally(() => setLoading(false)); }}>Retry</button></div>}

      {notice && <Feedback tone="info" onDismiss={() => setNotice('')}>{notice}</Feedback>}

      {/* ---------- Summary cards ---------- */}
      <section className={styles.summaryGrid} aria-label="Transfer summary">
        <button type="button" className={`${styles.summaryCard} ${styles.summaryAmber} ${filterStatus === 'PENDING' ? styles.summaryOn : ''}`} onClick={() => setFilterStatus(filterStatus === 'PENDING' ? 'ALL' : 'PENDING')}>
          <i className={styles.summaryIcon}><Icon name="clock" size={18} /></i>
          <div className={styles.summaryMain}>
            <span className={styles.summaryLabel}>Pending action</span>
            <strong className={styles.summaryValue}>{kpis.pending}</strong>
          </div>
          <div className={styles.summaryDetail}>
            <span className={styles.summaryDetailLabel}>Units</span>
            <b className={`${styles.chip} ${styles.chipAmber}`}>{kpis.pendingUnits}</b>
          </div>
        </button>
        <button type="button" className={`${styles.summaryCard} ${styles.summaryBlue} ${filterStatus === 'TRANSIT' ? styles.summaryOn : ''}`} onClick={() => setFilterStatus(filterStatus === 'TRANSIT' ? 'ALL' : 'TRANSIT')}>
          <i className={styles.summaryIcon}><Icon name="truck" size={18} /></i>
          <div className={styles.summaryMain}>
            <span className={styles.summaryLabel}>In transit</span>
            <strong className={styles.summaryValue}>{kpis.inTransit}</strong>
          </div>
          <div className={styles.summaryDetail}>
            <span className={styles.summaryDetailLabel}>Units</span>
            <b className={`${styles.chip} ${styles.chipBlue}`}>{kpis.inTransitUnits}</b>
          </div>
        </button>
        <button type="button" className={`${styles.summaryCard} ${styles.summaryPurple} ${filterStatus === 'RECEIVED' ? styles.summaryOn : ''}`} onClick={() => setFilterStatus(filterStatus === 'RECEIVED' ? 'ALL' : 'RECEIVED')}>
          <i className={styles.summaryIcon}><Icon name="check" size={18} /></i>
          <div className={styles.summaryMain}>
            <span className={styles.summaryLabel}>Received</span>
            <strong className={styles.summaryValue}>{kpis.received}</strong>
          </div>
          <div className={styles.summaryDetail}>
            <span className={styles.summaryDetailLabel}>Status</span>
            {kpis.withIssues ? <b className={`${styles.chip} ${styles.chipRed}`}>{kpis.withIssues} issues</b> : <b className={`${styles.chip} ${styles.chipGreen}`}>All good</b>}
          </div>
        </button>
        <div className={`${styles.summaryCard} ${styles.summaryGreen}`}>
          <i className={styles.summaryIcon}><Icon name="box" size={18} /></i>
          <div className={styles.summaryMain}>
            <span className={styles.summaryLabel}>Open units</span>
            <strong className={styles.summaryValue}>{kpis.openUnits.toLocaleString('en-IN')}</strong>
          </div>
          <div className={styles.summaryDetail}>
            <span className={styles.summaryDetailLabel}>Transfers</span>
            <b className={`${styles.chip} ${styles.chipGreen}`}>{kpis.openTransfers}</b>
          </div>
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
                icon={<Icon name={fromFilter !== 'ALL' && isWarehouse(locationName(fromFilter)) ? 'warehouse' : 'store'} size={14} />}
                buttonLabel={fromFilter === 'ALL' ? 'From: any' : `From: ${locationName(fromFilter)}`}
                options={[{ value: 'ALL', label: 'Any location' }, ...locations.map((l) => ({ value: l.id, label: l.name }))]}
                onChange={(v) => { setFromFilter(v); if (v !== 'ALL' && v === toFilter) setToFilter('ALL'); }}
              />
              <button type="button" className={styles.swapButton} onClick={() => { setFromFilter(toFilter); setToFilter(fromFilter); }} disabled={fromFilter === 'ALL' && toFilter === 'ALL'} title="Swap From and To" aria-label="Swap From and To filters"><Icon name="swap" size={14} /></button>
              <PillDropdown<string>
                value={toFilter}
                heading="Sent to"
                ariaLabel="Filter by destination"
                icon={<Icon name={toFilter !== 'ALL' && isWarehouse(locationName(toFilter)) ? 'warehouse' : 'store'} size={14} />}
                buttonLabel={toFilter === 'ALL' ? 'To: any' : `To: ${locationName(toFilter)}`}
                options={[{ value: 'ALL', label: 'Any location' }, ...locations.filter((l) => l.id !== fromFilter).map((l) => ({ value: l.id, label: l.name }))]}
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
            const created = splitStamp(t.createdAt, t.timezone);
            const canApprove = canApproveTransfers && t.requestedByUserId !== apiUserId && canActAt(t.sourceLocationId);
            const canDispatch = canDispatchTransfers && canActAt(t.sourceLocationId) && ['APPROVED', 'PARTIALLY_DISPATCHED', 'PARTIALLY_RECEIVED'].includes(t.status) && t.items.some((item) => item.approvedQtyBase - item.dispatchedQtyBase >= (item.cartonRequired ? item.unitsPerCarton : 1));
            const hasOutstanding = t.items.some((item) => outstandingQuantity(item) > 0);
            const canReceive = canReceiveTransfers && canActAt(t.destLocationId) && hasOutstanding && ['DISPATCHED', 'PARTIALLY_DISPATCHED', 'PARTIALLY_RECEIVED'].includes(t.status);
            const awaitingPacking = ['APPROVED', 'PARTIALLY_DISPATCHED', 'PARTIALLY_RECEIVED'].includes(t.status)
              && t.items.some((item) => item.approvedQtyBase > item.dispatchedQtyBase);
            const nextSteps = [
              t.status === 'DRAFT' ? 'Submit · requesting manager' : null,
              t.status === 'PENDING_APPROVAL' ? `Approve · another manager at ${t.sourceLocation}` : null,
              awaitingPacking ? `Pack · manager at ${t.sourceLocation}` : null,
              hasOutstanding ? `Receive · authorized team at ${t.destLocation}` : null,
            ].filter(Boolean);
            return (
              <Fragment key={t.id}>
                <li className={`${styles.row} ${isOpen ? styles.rowOpen : ''}`}>
                  <button type="button" className={styles.rowMain} onClick={() => setExpanded(isOpen ? null : t.id)} aria-expanded={isOpen}>
                    <span className={`${styles.rowIcon} ${styles[`icon_${issues ? 'issue' : meta.tone}`]}`}><Icon name={t.status === 'RECEIVED' ? 'inbox' : (unitsInTransit(t) > 0) ? 'truck' : 'clock'} size={17} /></span>
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
                    <strong>{t.status === 'RECEIVED' ? `${t.receipt?.good ?? 0} received good` : `${unitsInTransit(t)} in transit`}</strong>
                    {pendingUnits(t) > 0 && <small>{pendingUnits(t)} {awaitingPacking ? 'to pack' : 'to approve'}</small>}
                    <small>{t.items.length} product{t.items.length === 1 ? '' : 's'} · {t.items.reduce((sum, item) => sum + item.cartons, 0)} cartons requested</small>
                  </span>

                  <span><span className={`${styles.status} ${styles[issues ? 'issue' : meta.tone]}`}><i />{issues ? `${meta.label} · issues` : meta.label}</span>{nextSteps.map((step) => <small className={styles.nextStep} key={step}>{step}</small>)}</span>

                  <span className={styles.rowActions}>
                    {canRequestTransfers && t.status === 'DRAFT' && <button type="button" className={styles.actionButton} onClick={() => submitTransfer(t)}>Submit</button>}
                    {t.status === 'PENDING_APPROVAL' && (canApprove ? <button type="button" className={styles.actionButton} onClick={() => approveTransfer(t)}>Approve</button> : <small>Waiting for another manager</small>)}
                    {t.auditLocked && (canDispatch || canReceive) && <small role="status">Paused for stock count</small>}
                    {canDispatch && !t.auditLocked && <button type="button" className={styles.actionButton} onClick={() => openPacking(t)}>Confirm packing</button>}
                    {canReceive && !t.auditLocked && <button type="button" className={styles.actionButton} onClick={() => openReceive(t)}>Receive</button>}
                    <span className={styles.menuWrap} data-row-menu>
                      <button type="button" className={`${styles.moreButton} ${menuFor === t.id ? styles.moreOn : ''}`} onClick={() => setMenuFor(menuFor === t.id ? null : t.id)} aria-haspopup="menu" aria-expanded={menuFor === t.id} aria-label={`Options for ${t.transferCode}`}><Icon name="more" size={16} /></button>
                      {menuFor === t.id && (
                        <div className={styles.menu} role="menu">
                          <div className={styles.menuHeading}>{t.transferCode}</div>
                          <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setExpanded(isOpen ? null : t.id); }}><Icon name="eye" size={15} /><span><b>{isOpen ? 'Hide details' : 'View details'}</b><small>Products, timeline and notes</small></span></button>
                          {canRequestTransfers && t.status === 'DRAFT' && <button type="button" role="menuitem" onClick={() => submitTransfer(t)}><Icon name="send" size={15} /><span><b>Submit for approval</b><small>Send draft to a manager</small></span></button>}
                          {canApprove && t.status === 'PENDING_APPROVAL' && <button type="button" role="menuitem" onClick={() => approveTransfer(t)}><Icon name="check" size={15} /><span><b>Approve</b><small>Approver cannot be the requester</small></span></button>}
                          {canApprove && t.status === 'PENDING_APPROVAL' && <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setReasonAction({ title: `Reject ${t.transferCode}?`, submit: (reason) => rejectTransfer(t, reason) }); }}><Icon name="x" size={15} /><span><b>Reject transfer</b><small>Record a reason</small></span></button>}
                          {canDispatch && !t.auditLocked && <button type="button" role="menuitem" onClick={() => openPacking(t)}><Icon name="send" size={15} /><span><b>Confirm packed quantities</b><small>Server checks available inventory</small></span></button>}
                          {canReceive && !t.auditLocked && <button type="button" role="menuitem" onClick={() => openReceive(t)}><Icon name="inbox" size={15} /><span><b>Receive stock</b><small>Check and add to inventory</small></span></button>}
                          {canApproveTransfers && !['RECEIVED', 'REJECTED', 'CANCELLED'].includes(t.status) && <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setReasonAction({ title: `Cancel ${t.transferCode}?`, submit: (reason) => cancelTransfer(t, reason) }); }}><Icon name="x" size={15} /><span><b>Cancel transfer</b><small>Server records any in-transit reversal</small></span></button>}
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
                      <div className={styles.progressLines}>
                        {t.items.map((item) => (
                          <div key={item.variantId} className={styles.progressLine}>
                            <strong>{item.name}</strong>
                            <small>{item.sku} · {item.unitsPerCarton > 1 ? `${item.unitsPerCarton} per carton` : 'Ships loose'}</small>
                            <dl>
                              {Object.entries({
                                Requested: item.requestedQtyBase, Approved: item.approvedQtyBase,
                                Packed: item.dispatchedQtyBase, 'In transit': activeTransfer(t) ? outstandingQuantity(item) : 0,
                                'Received good': item.receivedQtyBase - item.damagedQtyBase,
                                Damaged: item.damagedQtyBase, Missing: item.shortQtyBase,
                              }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
                            </dl>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={styles.detailSide}>
                      <ol className={styles.timeline}>
                        <li className={styles.done}><i /><span><strong>Created</strong><small>{transferTime(t.createdAt, t.timezone)}</small></span></li>
                        <li className={t.dispatchedAt ? styles.done : styles.next}><i /><span><strong>Dispatched</strong><small>{t.dispatchedAt ? transferTime(t.dispatchedAt, t.timezone) : 'Waiting to be sent'}</small></span></li>
                        <li className={t.receivedAt ? (issues ? styles.warn : styles.done) : t.dispatchedAt ? styles.next : ''}><i /><span><strong>Received</strong><small>{t.receivedAt ? transferTime(t.receivedAt, t.timezone) : (t.dispatchedAt ? 'On the way' : '—')}</small></span></li>
                      </ol>
                      <div className={styles.facts}><span><small>Transfer status</small><b>{meta.label}</b></span><span><small>Requested by</small><b>{t.requestedByName || 'See audit record'}</b></span></div>
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
            <strong>{loading ? 'Loading transfers…' : 'No transfers found'}</strong>
            <p>{loading ? 'Loading current transfers from the server.' : apiToken ? 'Create the first transfer after setting up locations and products.' : 'Sign in with a manager account to access transfers.'}</p>
            <button type="button" className={styles.ghostButton} onClick={() => { setFilterStatus('ALL'); setLocationFilter('ALL'); setFromFilter('ALL'); setToFilter('ALL'); setSearch(''); }}>Clear filters</button>
          </div>
        )}

        <footer className={styles.tableFoot}>
          <span>Showing <b>{filteredTransfers.length}</b> of <b>{scoped.length}</b> transfers</span>
          <span>{filteredTransfers.reduce((s, t) => s + unitsOf(t), 0).toLocaleString('en-IN')} units</span>
        </footer>
      </section>

      {!receiveOnly && <section className={styles.tableCard} aria-labelledby="replenishment-heading">
        <div className={styles.tableTop}><div><div className="heading-with-info"><h2 id="replenishment-heading">Replenishment requests</h2><InfoHint label="About replenishment requests">Review suggested transfers to restock low inventory. A different manager must approve the request.</InfoHint></div><p>Server generated suggestions require approval by a different manager.</p></div></div>
        {!replenishments.length ? <div className={styles.empty}><strong>No replenishment requests</strong><p>Generate a request after the locations have reorder levels and stock records.</p><a href="/products">Open products and reorder levels</a></div> : (
          <ul className={styles.rows}>{replenishments.map((request) => {
            const isDepot = depotRequest(request);
            const needsDepot = isDepot && !request.depotAuthorizedAt;
            const canSignOff = canApproveTransfers && ['SUB_WAREHOUSE_MANAGER', 'SUPER_ADMIN'].includes(apiRole) && canActAt(request.destLocation.id);
            const canRelease = canApproveTransfers && canActAt(request.sourceLocation.id) &&
              request.generatedByUserId !== apiUserId && request.depotAuthorizedByUserId !== apiUserId;
            const isDraft = request.status === 'DRAFT';
            return <li className={styles.row} key={request.id} id={`replenishment-${request.id}`}>
              <span className={styles.rowTitle}><strong>{request.requestNumber}</strong><small>{request.sourceLocation.name} <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /> {request.destLocation.name}</small></span>
              <span className={styles.items}><strong>{request.lines.length} products</strong><small>{request.lines.reduce((sum, line) => sum + (request.depotAuthorizedAt ? line.managerApprovedQtyBase ?? 0 : line.systemSuggestedQtyBase), 0)} {request.depotAuthorizedAt ? 'authorized' : 'suggested'} units</small></span>
              <span className={`${styles.status} ${isDraft ? styles.pending : request.status === 'REJECTED' ? styles.rejected : styles.received}`}><i />{isDraft && isDepot ? needsDepot ? 'Awaiting depot authorization' : 'Awaiting main warehouse release' : request.status.replaceAll('_', ' ')}</span>
              {isDraft && <span className={styles.rowActions}>
                <button type="button" className={styles.actionButton} onClick={() => openReplenishment(request)} disabled={needsDepot ? !canSignOff : !canRelease}>{needsDepot ? 'Review and authorize' : isDepot ? 'Review and release' : 'Review quantities'}</button>
                {!needsDepot && <button type="button" className={styles.ghostButton} onClick={() => setReasonAction({ title: `Reject ${request.requestNumber}?`, submit: (reason) => rejectReplenishment(request, reason) })} disabled={!canRelease}>Reject</button>}
              </span>}
            </li>;
          })}</ul>
        )}
      </section>}

      {(packing || replenishing) && <div className={styles.backdrop}>
        <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="transfer-quantities-title">
          <header className={styles.modalHead}>
            <div><h2 id="transfer-quantities-title">{packing ? `Confirm packing for ${packing.transferCode}` : `Review ${replenishing?.requestNumber}`}</h2>
              <p>{packing ? 'Enter what was actually packed. The remaining quantities stay open.' : replenishing?.depotAuthorizedAt ? 'Review the depot’s authorized quantities before releasing the transfer for packing.' : 'Adjust the suggested quantities or add products before approving.'}</p></div>
          </header>
          <form onSubmit={packing ? confirmPacking : approveReplenishment}>
            <div className={styles.modalBody}>
              {packing ? packing.items.map((item) => {
                const ratio = item.cartonRequired ? item.unitsPerCarton : 1;
                const remaining = Math.floor((item.approvedQtyBase - item.dispatchedQtyBase) / ratio);
                const unit = item.cartonRequired ? 'cartons' : 'units';
                const available = packingBalances ? Math.floor(Math.max(0, packingBalances[item.variantId] ?? 0) / ratio) : null;
                if (remaining <= 0 || (item.cartonRequired && ratio <= 1)) return null;
                return <label className={styles.field} key={item.variantId}>
                  <span>{item.name} · {remaining} {unit} remaining</span>
                  {available !== null && <small>{available} {unit} available</small>}
                  <input type="number" inputMode="numeric" min="0" max={remaining} step="1" disabled={isSavingLines} value={lineQuantities[item.variantId] ?? ''} onChange={(event) => setLineQuantities((current) => ({ ...current, [item.variantId]: Number(event.target.value) }))} />
                </label>;
              }) : replenishing && (() => {
                const choices = catalog.filter((variant) => !(variant.variantId in lineQuantities));
                return <>
                  {Object.entries(lineQuantities).map(([variantId, quantity]) => {
                    const suggested = replenishing.lines.find((line) => line.variantId === variantId);
                    const variant = catalog.find((item) => item.variantId === variantId);
                    const shipsInCartons = (suggested?.unitsPerCarton ?? variant?.unitsPerCarton ?? 1) > 1;
                    return <label className={styles.field} key={variantId}>
                      <span>{variant?.name ?? variantId} · {shipsInCartons ? 'Cartons' : 'Loose units'}</span>
                      <input type="number" min="0" step="1" max="2147483647" value={quantity} disabled={isSavingLines || !!replenishing.depotAuthorizedAt} onChange={(event) => setLineQuantities((current) => ({ ...current, [variantId]: Number(event.target.value) }))} />
                    </label>;
                  })}
                  {!replenishing.depotAuthorizedAt && <><label className={styles.field}><span>Add another product</span>
                    <select value={addedVariant} disabled={isSavingLines} onChange={(event) => setAddedVariant(event.target.value)}><option value="">Select a product</option>
                      {choices.map((variant) => <option key={variant.variantId} value={variant.variantId}>{variant.name} · {variant.sku}</option>)}
                    </select>
                  </label>
                  <button type="button" className={styles.ghostButton} disabled={!addedVariant || isSavingLines} onClick={() => {
                    setLineQuantities((current) => ({ ...current, [addedVariant]: 1 }));
                    setAddedVariant('');
                  }}>Add product</button></>}
                </>;
              })()}
              {lineError && <Feedback tone="error">{lineError}</Feedback>}
            </div>
            <footer className={styles.modalFoot}>
              <button type="button" className={styles.ghostButton} disabled={isSavingLines} onClick={() => { setPacking(null); setReplenishing(null); }}>Cancel</button>
              <button type="submit" className={styles.primaryButton} disabled={isSavingLines}>{isSavingLines ? 'Saving…' : packing ? 'Confirm and dispatch' : replenishing?.depotAuthorizedAt ? 'Release for packing' : replenishing && depotRequest(replenishing) ? 'Authorize and send upstream' : 'Approve request'}</button>
            </footer>
          </form>
        </section>
      </div>}

      {/* ---------- Receive modal ---------- */}
      {receivingTransfer && (
        <div className={styles.backdrop} onClick={() => { if (!isReceivingBusy) setReceivingTransfer(null); }}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="receive-title" onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <span className={`${styles.modalIcon} ${styles.icon_transit}`}><Icon name="inbox" size={18} /></span>
              <div>
                <h2 id="receive-title">Receive {receivingTransfer.transferCode}</h2>
                <p>{receivingTransfer.sourceLocation} <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /> {receivingTransfer.destLocation}</p>
              </div>
              <button type="button" className={styles.modalClose} onClick={() => setReceivingTransfer(null)} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <form onSubmit={handleReceiveConfirm}>
              <div className={styles.modalBody}>
                <div className={styles.manifest}>
                  {receivingTransfer.items.filter((item) => outstandingQuantity(item) > 0).map((item) => {
                    const expected = outstandingQuantity(item);
                    const issues = receiptIssues[item.variantId] ?? { damaged: 0, missing: 0 };
                    return <fieldset key={item.variantId} className={styles.receiptLine}>
                      <legend>{item.name} · {item.sku}</legend>
                      <span>Expected <strong>{expected} {item.baseUnit}{expected === 1 ? '' : 's'}</strong>
                        {item.unitsPerCarton > 1 && <small> · {item.unitsPerCarton} per carton</small>}
                      </span>
                      <label>Damaged<input type="number" min="0" step="1" max={expected} value={issues.damaged} onChange={(event) => setReceiptIssues((current) => ({ ...current, [item.variantId]: { ...issues, damaged: Number(event.target.value) } }))} /></label>
                      <label>Missing<input type="number" min="0" step="1" max={expected} value={issues.missing} onChange={(event) => setReceiptIssues((current) => ({ ...current, [item.variantId]: { ...issues, missing: Number(event.target.value) } }))} /></label>
                      <span>Into stock <strong>{Math.max(0, expected - issues.damaged - issues.missing)} {item.baseUnit}{expected - issues.damaged - issues.missing === 1 ? '' : 's'}</strong></span>
                    </fieldset>;
                  })}
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
                        {locations.map((l) => (
                          <button key={l.id} type="button" className={`${styles.option} ${newOrigin === l.id ? styles.optionOn : ''}`} onClick={() => { setNewOrigin(l.id); if (newDest === l.id) setNewDest(locations.find((x) => x.id !== l.id)?.id ?? ''); }} aria-pressed={newOrigin === l.id}>
                            <Icon name={isWarehouse(l.name) ? 'warehouse' : 'store'} size={15} />{l.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button type="button" className={styles.routeArrow} onClick={() => { setNewOrigin(newDest); setNewDest(newOrigin); }} title="Swap From and To" aria-label="Swap From and To"><Icon name="swap" size={16} /></button>
                    <div>
                      <small className={styles.groupLabel}>To</small>
                      <div className={styles.options}>
                        {locations.map((l) => (
                          <button key={l.id} type="button" className={`${styles.option} ${newDest === l.id ? styles.optionOn : ''}`} onClick={() => setNewDest(l.id)} disabled={l.id === newOrigin} aria-pressed={newDest === l.id}>
                            <Icon name={isWarehouse(l.name) ? 'warehouse' : 'store'} size={15} />{l.name}
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
                    {catalog.map((p) => {
                      const q = draft[p.sku];
                      return (
                        <div key={p.sku} className={`${styles.productCard} ${q ? styles.productOn : ''}`}>
                          <button type="button" className={styles.productPick} onClick={() => toggleProduct(p.sku)} aria-pressed={!!q}>
                            <span className={styles.check}>{q && <Icon name="check" size={12} />}</span>
                            <span><strong>{p.name}</strong><small>{p.sku} · {p.unitsPerCarton > 1 ? `${p.unitsPerCarton} per carton` : 'Ships loose'}</small></span>
                          </button>
                          {q && (
                            <div className={styles.productQty}>
                              {p.unitsPerCarton > 1 && <label><small>Cartons</small><Stepper value={q.cartons} onChange={(v) => setQty(p.sku, 'cartons', v)} label={`cartons of ${p.name}`} /></label>}
                              {p.unitsPerCarton <= 1 && <label><small>Loose</small><Stepper value={q.loose} onChange={(v) => setQty(p.sku, 'loose', v)} label={`loose units of ${p.name}`} /></label>}
                              <span className={styles.qtyTotal}><small>Units</small><b>{q.cartons * p.unitsPerCarton + (p.unitsPerCarton > 1 ? 0 : q.loose)}</b></span>
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
                  <p>Carrier and tracking details can be recorded after the transfer is created.</p>
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
                <span className={styles.footSummary}>{draftTotal} units · {locationName(newOrigin)} <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /> {locationName(newDest)}</span>
                <button type="button" className={styles.ghostButton} onClick={() => setCreateModalOpen(false)}>Cancel</button>
                <button type="submit" disabled={isCreatingBusy} className={styles.primaryButton}><Icon name={dispatchNow ? 'send' : 'check'} size={15} /> {isCreatingBusy ? 'Saving…' : dispatchNow ? 'Create & submit' : 'Save draft'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {reasonAction && <ReasonDialog action={reasonAction} onClose={() => setReasonAction(null)} />}
    </div>
  );
}
