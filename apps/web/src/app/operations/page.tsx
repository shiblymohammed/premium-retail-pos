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
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getStoredSession } from '@/lib/auth';
import { downloadCsv } from '@/lib/report-download';
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
  excessQtyBase?: number;
  discrepancyNotes?: string | null;
}

interface ReceiptSummary {
  good: number;
  damaged: number;
  missing: number;
}

type ReceiptDiscrepancy = {
  receiptId?: string | null; variantId: string; receivedAt: string; short: number; damaged: number; excess: number; note: string | null;
};

type ReceiptQuantity = { received: number; damaged: number; closeShortage: boolean };

interface StockTransfer {
  id: string;
  sourceLocationId: string;
  destLocationId: string;
  requestedByUserId: string;
  requestedByName?: string;
  timezone?: string;
  auditLocked?: boolean;
  hasStockToPack?: boolean;
  receiptDiscrepancies?: ReceiptDiscrepancy[];
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
  transfer?: { id: string; transferNumber: string; status: TransferStatus } | null;
  status: string;
  generatedByUserId: string;
  depotAuthorizedAt?: string | null;
  depotAuthorizedByUserId?: string | null;
  sourceLocation: { id: string; name: string; type: string };
  destLocation: { id: string; name: string; type: string };
  lines: Array<{ variantId: string; systemSuggestedQtyBase: number; managerApprovedQtyBase?: number | null; unitsPerCarton: number | null; baseUnitSnapshot?: string | null; variant?: { sku: string; name: string; product?: { name: string } } }>;
}

type LocationOption = { id: string; name: string; type: string; parentId: string | null };
type CatalogOption = { variantId: string; sku: string; name: string; baseUnit: string; unitsPerCarton: number };


function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <span className={styles.stepper}>
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 0} aria-label={`Less ${label}`}><Icon name="minus" size={13} /></button>
      <input type="number" min="0" value={value} onChange={(e) => onChange(Math.floor(Number(e.target.value) || 0))} aria-label={label} />
      <button type="button" onClick={() => onChange(value + 1)} aria-label={`More ${label}`}><Icon name="plus" size={13} /></button>
    </span>
  );
}

function shipmentQuantity(quantity: number, baseUnit: string, unitsPerCarton: number) {
  const packets = `${quantity} ${baseUnit}${quantity === 1 ? '' : 's'}`;
  if (unitsPerCarton <= 1 || quantity < unitsPerCarton) return packets;
  const cartons = Math.floor(quantity / unitsPerCarton);
  const loose = quantity % unitsPerCarton;
  return `${packets} · ${cartons} carton${cartons === 1 ? '' : 's'}${loose ? ` + ${loose} loose` : ''}`;
}

const isReceiver = (role?: string) => role === 'STAFF' || role === 'CASHIER';
const outstandingQuantity = (item: TransferItem) => Math.max(0, item.dispatchedQtyBase - item.receivedQtyBase - item.shortQtyBase);

function receiptAmounts(expected: number, { received, damaged, closeShortage }: ReceiptQuantity) {
  const accepted = Math.min(received, expected);
  const excess = received - accepted;
  const short = closeShortage ? expected - accepted : 0;
  return { accepted, excess, short, good: Math.max(0, accepted - damaged), pending: expected - accepted - short };
}

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
const hasIssues = (t: StockTransfer) => t.items.some((item) => item.damagedQtyBase + item.shortQtyBase + (item.excessQtyBase ?? 0) > 0);
const isWarehouse = (loc: string) => /warehouse/i.test(loc);
const activeTransfer = (t: StockTransfer) => !['RECEIVED', 'REJECTED', 'CANCELLED'].includes(t.status);
const packingStatuses: TransferStatus[] = ['APPROVED', 'PARTIALLY_DISPATCHED', 'PARTIALLY_RECEIVED'];
const receivingStatuses: TransferStatus[] = ['DISPATCHED', 'PARTIALLY_DISPATCHED', 'PARTIALLY_RECEIVED'];
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
  const [packingStockError, setPackingStockError] = useState(false);
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
  const canGenerateDepotRestock = can('transfers.request', defaultManager);
  const canApproveTransfers = can('transfers.approve', defaultManager);
  const canDispatchTransfers = can('transfers.dispatch', defaultManager);
  const canReceiveTransfers = can('transfers.receive', apiRole !== 'INVENTORY');
  const receiveOnly = !canRequestTransfers && !canApproveTransfers && !canDispatchTransfers;

  const canActAt = useCallback((id: string) =>
    apiRole === 'SUPER_ADMIN' || locations.some((location) => location.id === id), [apiRole, locations]);
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
  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, ReceiptQuantity>>({});
  const [receiveNotes, setReceiveNotes] = useState('');
  const [receiveError, setReceiveError] = useState('');
  const [isReceivingBusy, setIsReceivingBusy] = useState(false);

  // Create modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [warehouseChoices, setWarehouseChoices] = useState<Array<Pick<LocationOption, 'id' | 'name' | 'type'>> | null>(null);
  const [openingRestock, setOpeningRestock] = useState(false);
  const [productSearch, setProductSearch] = useState('');
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
        excessQtyBase: Number(line.excessQtyBase || 0),
        discrepancyNotes: line.discrepancyNotes ?? null,
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
      hasStockToPack: row.hasStockToPack,
      receiptDiscrepancies: row.receiptDiscrepancies,
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
        requestNumber: typeof request.requestNumber === 'string' ? request.requestNumber : 'Restock request',
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

  async function retryOperations() {
    setLoading(true);
    setApiError('');
    try {
      await reloadOperations();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Could not load transfers.');
    } finally {
      setLoading(false);
    }
  }

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
      if (!isCreatingBusy) setCreateModalOpen(false);
      setMenuFor(null);
    };
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-row-menu]')) setMenuFor(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick); };
  }, [isReceivingBusy, isSavingLines, isCreatingBusy]);

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

    void readStock().catch(() => { if (!controller.signal.aborted) setPackingStockError(true); });
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

  const transferActions = useMemo(() => new Map(scoped.map((transfer) => {
    const sourceAccess = canActAt(transfer.sourceLocationId);
    const destinationAccess = canActAt(transfer.destLocationId);
    const transitUnits = unitsInTransit(transfer);
    const waitingUnits = pendingUnits(transfer);
    const canSubmit = canRequestTransfers && transfer.status === 'DRAFT' && (sourceAccess || destinationAccess);
    const canApprove = canApproveTransfers && transfer.status === 'PENDING_APPROVAL'
      && transfer.requestedByUserId !== apiUserId && sourceAccess;
    const awaitingPacking = packingStatuses.includes(transfer.status) && waitingUnits > 0;
    const canDispatch = canDispatchTransfers && sourceAccess && awaitingPacking
      && transfer.items.some((item) => item.approvedQtyBase - item.dispatchedQtyBase >= (item.cartonRequired ? item.unitsPerCarton : 1));
    const canReceive = canReceiveTransfers && destinationAccess && transitUnits > 0 && receivingStatuses.includes(transfer.status);
    const noStockToPack = canDispatch && transfer.hasStockToPack === false;
    const canPackNow = canDispatch && !transfer.auditLocked && !noStockToPack;
    const canReceiveNow = canReceive && !transfer.auditLocked;
    const actionUnits = (canSubmit || canApprove || canPackNow ? waitingUnits : 0) + (canReceiveNow ? transitUnits : 0);
    return [transfer.id, {
      canSubmit, canApprove, canPackNow, canReceiveNow, awaitingPacking, transitUnits, waitingUnits, actionUnits, noStockToPack,
      paused: transfer.auditLocked && (canDispatch || canReceive),
      needsAction: canSubmit || canApprove || canPackNow || canReceiveNow,
    }] as const;
  })), [scoped, canActAt, canRequestTransfers, canApproveTransfers, canDispatchTransfers, canReceiveTransfers, apiUserId]);

  const filteredTransfers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = scoped.filter((t) => {
      const actions = transferActions.get(t.id)!;
      const matchStatus = filterStatus === 'ALL' || (filterStatus === 'PENDING' ? actions.needsAction : filterStatus === 'TRANSIT' ? actions.transitUnits > 0 : t.status === 'RECEIVED');
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
  }, [scoped, transferActions, filterStatus, fromFilter, toFilter, sortKey, search]);

  const kpis = useMemo(() => {
    const actions = [...transferActions.values()];
    const inTransit = actions.filter((action) => action.transitUnits > 0);
    const pending = actions.filter((action) => action.needsAction);
    const received = scoped.filter((t) => t.status === 'RECEIVED');
    return {
      inTransit: inTransit.length,
      inTransitUnits: inTransit.reduce((sum, action) => sum + action.transitUnits, 0),
      pending: pending.length,
      actionUnits: pending.reduce((sum, action) => sum + action.actionUnits, 0),
      received: received.length,
      withIssues: received.filter(hasIssues).length,
      openTransfers: actions.filter((action) => action.waitingUnits > 0 || action.transitUnits > 0).length,
      openUnits: actions.reduce((sum, action) => sum + action.waitingUnits + action.transitUnits, 0),
    };
  }, [scoped, transferActions]);

  const statusCounts: Record<StatusFilter, number> = {
    ALL: scoped.length, PENDING: kpis.pending, TRANSIT: kpis.inTransit, RECEIVED: kpis.received,
  };

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
    setReceiptQuantities(Object.fromEntries(transfer.items.map((item) => [item.variantId, {
      received: outstandingQuantity(item), damaged: 0, closeShortage: false,
    }])));
    setReceiveNotes('');
    setReceiveError('');
  }

  async function handleReceiveConfirm(event: FormEvent) {
    event.preventDefault();
    if (!receivingTransfer || isReceivingBusy) return;
    const lines = receivingTransfer.items.filter((item) => outstandingQuantity(item) > 0).map((item) => {
      const expected = outstandingQuantity(item);
      const quantities = receiptQuantities[item.variantId];
      return { variantId: item.variantId, expected, ...quantities, ...receiptAmounts(expected, quantities) };
    }).filter((line) => line.received > 0 || line.closeShortage);
    if (!lines.length) {
      setReceiveError('Enter a received quantity or close a confirmed shortage.');
      return;
    }
    if (lines.some((line) => line.damaged > line.accepted)) {
      setReceiveError('Damaged units cannot exceed the received quantity within the dispatch.');
      return;
    }
    if (lines.some((line) => line.damaged || line.short || line.excess) && !receiveNotes.trim()) {
      setReceiveError('Add a note to explain the discrepancy.');
      return;
    }
    setIsReceivingBusy(true);
    setReceiveError('');
    try {
      await mutate(`/transfers/${receivingTransfer.id}/receive`, 'POST', {
        lines: lines.map(({ variantId, expected, received, damaged, short, excess }) => ({
          variantId,
          expectedOutstandingQtyBase: expected,
          receivedQtyBase: received,
          damagedQtyBase: damaged,
          ...(short ? { shortQtyBase: short, finalizeLine: true } : {}),
          ...((damaged || short || excess) ? { discrepancyNotes: receiveNotes.trim() } : {}),
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
    setPackingBalances(null);
    setPackingStockError(false);
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

  const restockDestination = locations.find((location) => location.id === locationFilter);
  const manualRestock = warehouseChoices !== null;

  async function requestRestock() {
    if (openingRestock || !restockDestination || !apiToken) return;
    setOpeningRestock(true);
    try {
      if (restockDestination.type === 'RETAIL_STORE') {
        const response = await fetch(`${API_BASE}/transfers/replenishment/sources/${restockDestination.id}`, {
          headers: { Authorization: `Bearer ${apiToken}` }, cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Could not load supplying warehouses.');
        openCreate();
        setWarehouseChoices(result.data);
        setNewOrigin('');
        setNewDest(restockDestination.id);
      } else await generateDepotRestock();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not start restock.'); }
    finally { setOpeningRestock(false); }
  }

  async function generateDepotRestock() {
    if (locationFilter === 'ALL') { setNotice('Choose a destination in the location selector first.'); return; }
    try {
      const request = await mutate('/transfers/replenishment/generate', 'POST', { destLocationId: locationFilter });
      setNotice(request?.id ? `Restock request ${request.requestNumber} created for manager review.` : 'No restock is needed for the selected depot.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not create the depot restock request.'); }
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
        : depotRequest(replenishing) ? `Restock request ${replenishing.requestNumber} released for packing.`
        : `Restock request ${replenishing.requestNumber} approved and transfer draft created.`);
    } catch (error) {
      setLineError(error instanceof Error ? error.message : 'Could not approve the restock request.');
    } finally {
      setIsSavingLines(false);
    }
  }

  async function rejectReplenishment(request: ReplenishmentRequest, reason: string) {
    try {
      await mutate(`/transfers/replenishment/${request.id}/reject`, 'POST', { reason });
      setNotice(`Replenishment ${request.requestNumber} rejected.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not reject the restock request.'); }
  }

  function openCreate() {
    // Start from the route filters if set, otherwise warehouse → the store chosen in the top bar
    setWarehouseChoices(null);
    setProductSearch('');
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
    if (isCreatingBusy) return;
    if (!newOrigin || !newDest) { setCreateError('Choose the transfer locations.'); return; }
    if (newOrigin === newDest) { setCreateError('Pick a different destination.'); return; }
    if (!draftItems.length) { setCreateError('Choose at least one product to send.'); return; }
    if (draftItems.some((i) => i.totalUnits <= 0)) { setCreateError('Each product needs at least one carton or loose unit.'); return; }

    setIsCreatingBusy(true);
    try {
      const created = await mutate(manualRestock ? '/transfers/replenishment/request' : '/transfers', 'POST', {
        sourceLocationId: newOrigin,
        destLocationId: newDest,
        notes: newNotes.trim() || undefined,
        lines: draftItems.map((item) => ({ variantId: item.variantId, cartons: item.cartons, looseBaseUnits: item.looseUnits })),
      });
      if (manualRestock) {
        setNotice(`Restock request ${created?.requestNumber ?? ''} sent for warehouse approval.`);
      } else if (dispatchNow && created?.id) {
        await mutate(`/transfers/${created.id}/submit`, 'POST');
        setNotice('Transfer created and submitted for approval.');
      } else setNotice('Transfer draft saved. Submit it when ready for approval.');
      setCreateModalOpen(false);
    } catch (error) { setCreateError(error instanceof Error ? error.message : 'Transfer could not be saved.'); }
    finally { setIsCreatingBusy(false); }
  }

  function exportCsv(list: StockTransfer[]) {
    setMenuFor(null);
    const header = ['Transfer', 'Status', 'From', 'To', 'Carrier', 'Tracking', 'Created', 'Dispatched', 'Received', 'SKU', 'Product', 'Requested cartons', 'Units/carton', 'Requested loose', 'Requested units', 'Approved units', 'Packed units', 'In transit', 'Awaiting packing / approval', 'Received good', 'Damaged', 'Missing', 'Excess', 'Receipt discrepancies'];
    const rows = list.flatMap((t) => t.items.map((item) => {
      const history = (t.receiptDiscrepancies ?? []).filter((event) => event.variantId === item.variantId);
      const notes = history.map((event) =>
        `${event.receivedAt} · ${event.damaged} damaged, ${event.short} missing, ${event.excess} excess${event.note ? ` · ${event.note}` : ''}`);
      return [t.transferCode, STATUS_META[t.status].label, t.sourceLocation, t.destLocation, t.carrier, t.trackingNumber,
        t.createdAt, t.dispatchedAt ?? '', t.receivedAt ?? '', item.sku, item.name, item.cartons, item.unitsPerCarton,
        item.looseUnits, item.requestedQtyBase, item.approvedQtyBase, item.dispatchedQtyBase,
        activeTransfer(t) ? outstandingQuantity(item) : 0, pendingItemQuantity(t, item),
        item.receivedQtyBase - item.damagedQtyBase, item.damagedQtyBase, item.shortQtyBase, item.excessQtyBase ?? 0,
        notes.join('\n') || item.discrepancyNotes || ''];
    }));
    downloadCsv(header, rows, list.length === 1 ? `${list[0].transferCode}.csv` : `transfers-${new Date().toISOString().slice(0, 10)}.csv`);
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



  return (
    <div className={`${styles.page} app-page`}>
      {/* ---------- Header (same pattern as Products / Reports) ---------- */}
      <header className={styles.header}>
        <div>
          <h1>{receiveOnly ? 'Incoming deliveries' : 'Transfers & Logistics'}</h1>
          <p>{receiveOnly ? 'Check and receive stock at your assigned store.' : 'Send stock between locations, follow it on the road and receive it into inventory.'}</p>
        </div>
        {!receiveOnly && <div className={styles.headerActions}>
          <button type="button" className={styles.ghostButton} onClick={requestRestock} disabled={loading || !!apiError || !canRequestTransfers || !apiToken || openingRestock || !restockDestination || restockDestination.type === 'MAIN_WAREHOUSE' || (restockDestination.type === 'SUB_WAREHOUSE' && !canGenerateDepotRestock)}>{openingRestock ? 'Loading warehouses…' : 'Request restock'}</button>
          <button type="button" className={styles.primaryButton} onClick={openCreate} disabled={loading || !!apiError || !canRequestTransfers || !apiToken || locations.length < 2 || !catalog.length}><Icon name="plus" size={16} /> New transfer</button>
        </div>}
      </header>

      {notice && <Feedback tone="info" onDismiss={() => setNotice('')}>{notice}</Feedback>}

      {loading ? (
        <section className={styles.tableCard}><div className={styles.empty} role="status">Loading transfers…</div></section>
      ) : apiError ? (
        <section className={styles.tableCard} aria-label="Transfer load failure">
          <div className={styles.empty}>
            <span><Icon name="alert" size={24} /></span>
            <div role="alert">
              <strong>{receiveOnly ? 'Could not load incoming deliveries' : 'Could not load transfers and restock requests'}</strong>
              <p>{apiError}</p>
            </div>
            {apiToken && <button type="button" className={styles.ghostButton} onClick={() => void retryOperations()}>Retry</button>}
          </div>
        </section>
      ) : <>
      {/* ---------- Summary cards ---------- */}
      <section className={styles.summaryGrid} aria-label="Transfer summary">
        <button type="button" className={`${styles.summaryCard} ${styles.summaryAmber} ${filterStatus === 'PENDING' ? styles.summaryOn : ''}`} onClick={() => setFilterStatus(filterStatus === 'PENDING' ? 'ALL' : 'PENDING')}>
          <i className={styles.summaryIcon}><Icon name="clock" size={18} /></i>
          <div className={styles.summaryMain}>
            <span className={styles.summaryLabel}>Needs your action</span>
            <strong className={styles.summaryValue}>{kpis.pending}</strong>
          </div>
          <div className={styles.summaryDetail}>
            <span className={styles.summaryDetailLabel}>Units</span>
            <b className={`${styles.chip} ${styles.chipAmber}`}>{kpis.actionUnits}</b>
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
                {tab.label}<span>{statusCounts[tab.key]}</span>
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
            const { canSubmit, canApprove, canPackNow, canReceiveNow, awaitingPacking, transitUnits, waitingUnits, paused, noStockToPack } = transferActions.get(t.id)!;
            const nextSteps = [
              t.status === 'DRAFT' ? 'Submit · requesting manager' : null,
              t.status === 'PENDING_APPROVAL' ? `Approve · another manager at ${t.sourceLocation}` : null,
              noStockToPack ? 'No stock to pack' : null,
              awaitingPacking && !noStockToPack ? canPackNow ? `Pack · ${t.sourceLocation}` : `Awaiting packing at ${t.sourceLocation}` : null,
              transitUnits > 0 ? `Receive · authorized team at ${t.destLocation}` : null,
            ].filter(Boolean);
            return (
              <Fragment key={t.id}>
                <li className={`${styles.row} ${isOpen ? styles.rowOpen : ''}`}>
                  <button type="button" className={styles.rowMain} onClick={() => setExpanded(isOpen ? null : t.id)} aria-expanded={isOpen}>
                    <span className={`${styles.rowIcon} ${styles[`icon_${issues ? 'issue' : meta.tone}`]}`}><Icon name={t.status === 'RECEIVED' ? 'inbox' : transitUnits > 0 ? 'truck' : 'clock'} size={17} /></span>
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
                    <strong>{t.items.length === 1
                      ? shipmentQuantity(t.status === 'RECEIVED' ? t.receipt?.good ?? 0 : transitUnits, t.items[0].baseUnit, t.items[0].unitsPerCarton)
                      : `${t.status === 'RECEIVED' ? t.receipt?.good ?? 0 : transitUnits} units`} {t.status === 'RECEIVED' ? 'received good' : 'in transit'}</strong>
                    {waitingUnits > 0 && <small>{t.items.length === 1 ? shipmentQuantity(waitingUnits, t.items[0].baseUnit, t.items[0].unitsPerCarton) : `${waitingUnits} units`} {awaitingPacking ? 'to pack' : 'to approve'}</small>}
                    <small>{t.items.length === 1
                      ? shipmentQuantity(t.items[0].requestedQtyBase, t.items[0].baseUnit, t.items[0].unitsPerCarton) + ' requested'
                      : `${t.items.length} products · view quantities`}</small>
                  </span>

                  <span><span className={`${styles.status} ${styles[issues ? 'issue' : meta.tone]}`}><i />{issues ? `${meta.label} · issues` : meta.label}</span>{nextSteps.map((step) => <small className={styles.nextStep} key={step}>{step}</small>)}</span>

                  <span className={styles.rowActions}>
                    {canSubmit && <button type="button" className={styles.actionButton} onClick={() => submitTransfer(t)}>Submit</button>}
                    {t.status === 'PENDING_APPROVAL' && (canApprove ? <button type="button" className={styles.actionButton} onClick={() => approveTransfer(t)}>Approve</button> : <small>Waiting for another manager</small>)}
                    {paused && <small role="status">Paused for stock count</small>}
                    {canPackNow && <button type="button" className={styles.actionButton} onClick={() => openPacking(t)}>Confirm packing</button>}
                    {canReceiveNow && <button type="button" className={styles.actionButton} onClick={() => openReceive(t)}>Receive</button>}
                    <span className={styles.menuWrap} data-row-menu>
                      <button type="button" className={`${styles.moreButton} ${menuFor === t.id ? styles.moreOn : ''}`} onClick={() => setMenuFor(menuFor === t.id ? null : t.id)} aria-haspopup="menu" aria-expanded={menuFor === t.id} aria-label={`Options for ${t.transferCode}`}><Icon name="more" size={16} /></button>
                      {menuFor === t.id && (
                        <div className={styles.menu} role="menu">
                          <div className={styles.menuHeading}>{t.transferCode}</div>
                          <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setExpanded(isOpen ? null : t.id); }}><Icon name="eye" size={15} /><span><b>{isOpen ? 'Hide details' : 'View details'}</b><small>Products, timeline and notes</small></span></button>
                          {canSubmit && <button type="button" role="menuitem" onClick={() => submitTransfer(t)}><Icon name="send" size={15} /><span><b>Submit for approval</b><small>Send draft to a manager</small></span></button>}
                          {canApprove && t.status === 'PENDING_APPROVAL' && <button type="button" role="menuitem" onClick={() => approveTransfer(t)}><Icon name="check" size={15} /><span><b>Approve</b><small>Approver cannot be the requester</small></span></button>}
                          {canApprove && t.status === 'PENDING_APPROVAL' && <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setReasonAction({ title: `Reject ${t.transferCode}?`, submit: (reason) => rejectTransfer(t, reason) }); }}><Icon name="x" size={15} /><span><b>Reject transfer</b><small>Record a reason</small></span></button>}
                          {canPackNow && <button type="button" role="menuitem" onClick={() => openPacking(t)}><Icon name="send" size={15} /><span><b>Confirm packed quantities</b><small>Server checks available inventory</small></span></button>}
                          {canReceiveNow && <button type="button" role="menuitem" onClick={() => openReceive(t)}><Icon name="inbox" size={15} /><span><b>Receive stock</b><small>Check and add to inventory</small></span></button>}
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
                                Damaged: item.damagedQtyBase, Missing: item.shortQtyBase, Excess: item.excessQtyBase ?? 0,
                              }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{shipmentQuantity(value, item.baseUnit, item.unitsPerCarton)}</dd></div>)}
                            </dl>
                            {(t.receiptDiscrepancies ?? []).filter((event) => event.variantId === item.variantId).map((event, index) =>
                              <p className={styles.receiptNote} key={event.receiptId ?? index}>
                                <strong>{transferTime(event.receivedAt, t.timezone)}</strong>
                                {' · '}{event.damaged} damaged · {event.short} missing · {event.excess} excess
                                {event.note && <span>{event.note}</span>}
                              </p>)}
                            {item.discrepancyNotes && !t.receiptDiscrepancies?.some((event) => event.variantId === item.variantId && event.note) &&
                              <p className={styles.receiptNote}>{item.discrepancyNotes}</p>}

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
            <strong>No transfers found</strong>
            <p>{filterStatus === 'PENDING' ? 'No matching transfers need your action.' : 'Try a different status or location filter.'}</p>
            <button type="button" className={styles.ghostButton} onClick={() => { setFilterStatus('ALL'); setLocationFilter('ALL'); setFromFilter('ALL'); setToFilter('ALL'); setSearch(''); }}>Clear filters</button>
          </div>
        )}

        <footer className={styles.tableFoot}>
          <span>Showing <b>{filteredTransfers.length}</b> of <b>{scoped.length}</b> transfers</span>
          <span>{filteredTransfers.reduce((s, t) => s + unitsOf(t), 0).toLocaleString('en-IN')} units</span>
        </footer>
      </section>

      {!receiveOnly && <section className={styles.tableCard} aria-labelledby="replenishment-heading">
        <div className={styles.tableTop}><div><div className="heading-with-info"><h2 id="replenishment-heading">Restock requests</h2></div><p>The supplying warehouse reviews each request before it can be packed.</p></div></div>
        {!replenishments.length ? <div className={styles.empty}><strong>No restock requests</strong><p>Choose your store in the location selector, then select Request restock.</p></div> : (
          <ul className={styles.rows}>{replenishments.map((request) => {
            const isDepot = depotRequest(request);
            const needsDepot = isDepot && !request.depotAuthorizedAt;
            const canSignOff = canApproveTransfers && ['SUB_WAREHOUSE_MANAGER', 'SUPER_ADMIN'].includes(apiRole) && canActAt(request.destLocation.id);
            const canRelease = canApproveTransfers && canActAt(request.sourceLocation.id) &&
              request.generatedByUserId !== apiUserId && request.depotAuthorizedByUserId !== apiUserId;
            const isDraft = request.status === 'DRAFT';
            const transferDraft = request.transfer?.status === 'DRAFT';
            const pendingTransferApproval = request.transfer?.status === 'PENDING_APPROVAL';
            const requestStatus = isDraft
              ? isDepot ? needsDepot ? 'Awaiting depot authorization' : 'Awaiting main warehouse release' : 'Awaiting approval'
              : request.status === 'REJECTED' ? 'Rejected'
              : transferDraft ? 'Transfer draft ready' : pendingTransferApproval ? 'Transfer awaiting approval' : 'Transfer created';
            return <li className={styles.restockRow} key={request.id} id={`replenishment-${request.id}`}>
              <span className={styles.rowTitle}><strong>{request.requestNumber}</strong><small>{request.sourceLocation.name} <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /> {request.destLocation.name}</small></span>
              <details className={styles.restockItems}><summary>{request.lines.length} product{request.lines.length === 1 ? '' : 's'}</summary>
                <ul>{request.lines.map((line) => <li key={line.variantId}><strong>{line.variant?.product?.name ?? line.variant?.sku ?? 'Product'}</strong>
                  <small>{shipmentQuantity(line.managerApprovedQtyBase ?? line.systemSuggestedQtyBase, line.baseUnitSnapshot ?? 'unit', line.unitsPerCarton ?? 0)}</small></li>)}</ul>
              </details>
              <div>
                <span className={`${styles.status} ${isDraft || transferDraft || pendingTransferApproval ? styles.pending : request.status === 'REJECTED' ? styles.rejected : styles.received}`}><i />{requestStatus}</span>
                {request.transfer && <small className={styles.nextStep}>{request.transfer.transferNumber}
                  {transferDraft && ' · Submit the transfer for approval'}
                  {pendingTransferApproval && ' · Approve the transfer before packing'}</small>}
              </div>
              {isDraft && <span className={styles.rowActions}>
                <button type="button" className={styles.actionButton} onClick={() => openReplenishment(request)} disabled={needsDepot ? !canSignOff : !canRelease}>{needsDepot ? 'Review and authorize' : isDepot ? 'Review and release' : 'Review quantities'}</button>
                {!needsDepot && <button type="button" className={styles.ghostButton} onClick={() => setReasonAction({ title: `Reject ${request.requestNumber}?`, submit: (reason) => rejectReplenishment(request, reason) })} disabled={!canRelease}>Reject</button>}
              </span>}
            </li>;
          })}</ul>
        )}
      </section>}

      </>}

      {(packing || replenishing) && <div className={styles.backdrop}>
        <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="transfer-quantities-title">
          <header className={styles.modalHead}>
            <div><h2 id="transfer-quantities-title">{packing ? `Confirm packing for ${packing.transferCode}` : `Review ${replenishing?.requestNumber}`}</h2>
              <p>{packing ? 'Enter what was actually packed. The remaining quantities stay open.' : replenishing?.depotAuthorizedAt ? 'Review the depot’s authorized quantities before releasing the transfer for packing.' : 'Review the requested quantities and make any adjustments before approving.'}</p></div>
          </header>
          <form onSubmit={packing ? confirmPacking : approveReplenishment}>
            <div className={styles.modalBody}>
              {packing ? packing.items.map((item) => {
                const ratio = item.cartonRequired ? item.unitsPerCarton : 1;
                const remaining = Math.floor((item.approvedQtyBase - item.dispatchedQtyBase) / ratio);
                const unit = item.cartonRequired ? 'cartons' : `${item.baseUnit}s`;
                const availableBase = packingBalances ? Math.max(0, packingBalances[item.variantId] ?? 0) : null;
                const available = availableBase === null ? null : Math.floor(availableBase / ratio);
                if (remaining <= 0 || (item.cartonRequired && ratio <= 1)) return null;
                const quantity = lineQuantities[item.variantId] ?? 0;
                return <section className={styles.packingLine} key={item.variantId}>
                  <header><strong>{item.name}</strong><small>{item.sku}{item.cartonRequired ? ` · ${ratio} ${item.baseUnit}s per carton` : ''}</small></header>
                  <dl><div><dt>Left to pack</dt><dd>{shipmentQuantity(remaining * ratio, item.baseUnit, ratio)}</dd></div>
                    <div><dt>Available to pack</dt><dd>{available === null ? packingStockError ? 'Checked on dispatch' : 'Checking stock…' : shipmentQuantity(availableBase ?? 0, item.baseUnit, ratio)}</dd></div></dl>
                  {availableBase !== null && availableBase > 0 && available === 0 && <small>No full carton available.</small>}
                  <label className={styles.field}><span>Packed {unit}</span>
                    <input type="number" inputMode="numeric" min="0" max={available === null ? remaining : Math.min(available, remaining)} step="1"
                      disabled={isSavingLines || (available === null && !packingStockError) || available === 0} value={quantity || ''} placeholder="0"
                      onChange={(event) => setLineQuantities((current) => ({ ...current, [item.variantId]: Number(event.target.value) }))} />
                  </label>
                  {quantity > 0 && item.cartonRequired && <small>Dispatching {shipmentQuantity(quantity * ratio, item.baseUnit, ratio)}</small>}
                </section>;
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
              <button type="submit" className={styles.primaryButton} disabled={isSavingLines || (!!packing && !Object.values(lineQuantities).some((quantity) => quantity > 0))}>{isSavingLines ? 'Saving…' : packing ? 'Confirm and dispatch' : replenishing?.depotAuthorizedAt ? 'Release for packing' : replenishing && depotRequest(replenishing) ? 'Authorize and send upstream' : 'Approve request'}</button>
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
                    const quantities = receiptQuantities[item.variantId];
                    const { accepted, good, excess, short, pending } = receiptAmounts(expected, quantities);
                    const update = (changes: Partial<ReceiptQuantity>) => setReceiptQuantities((current) => ({
                      ...current, [item.variantId]: { ...current[item.variantId], ...changes },
                    }));
                    return <fieldset key={item.variantId} className={styles.receiptLine}>
                      <legend>{item.name} · {item.sku}</legend>
                      <p className={styles.receiptFull}>Expected <strong>{shipmentQuantity(expected, item.baseUnit, item.unitsPerCarton)}</strong></p>
                      <label>Actually received ({item.baseUnit}s)
                        <input type="number" required min="0" step="1" max="2147483647" value={quantities.received}
                          onChange={(event) => update({ received: Number(event.target.value), closeShortage: false })} />
                      </label>
                      <label>Damaged within dispatch
                        <input type="number" required min="0" step="1" max={accepted} value={quantities.damaged}
                          onChange={(event) => update({ damaged: Number(event.target.value) })} />
                      </label>
                      {quantities.received < expected && <label className={styles.closeShortage}>
                        <input type="checkbox" checked={quantities.closeShortage}
                          onChange={(event) => update({ closeShortage: event.target.checked })} />
                        Confirm remaining {expected - accepted} as missing
                      </label>}
                      <div className={styles.receiptFull}>
                        <strong>{good} into stock</strong> · {quantities.damaged + excess} into quarantine
                        {excess > 0 && ` (${excess} excess)`}
                        {pending > 0 && ` · ${pending} still in transit`}
                        {short > 0 && ` · ${short} confirmed missing`}
                      </div>
                    </fieldset>;
                  })}
                </div>

                <label className={styles.field}><span>Note</span><textarea rows={2} maxLength={1000} value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} placeholder="e.g. 1 carton crushed, 2 units missing" /></label>
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
        <div className={styles.backdrop} onClick={() => { if (!isCreatingBusy) setCreateModalOpen(false); }}>
          <div className={`${styles.modal} ${styles.modalWide}`} role="dialog" aria-modal="true" aria-labelledby="create-title" onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <span className={`${styles.modalIcon} ${styles.icon_transit}`}><Icon name="truck" size={18} /></span>
              <div>
                <h2 id="create-title">{manualRestock ? 'Request restock' : 'New transfer'}</h2>
                <p>{manualRestock ? 'Choose a supplying warehouse and enter the quantities your store needs.' : 'Pick the route, the products and how it travels.'}</p>
              </div>
              <button type="button" className={styles.modalClose} disabled={isCreatingBusy} onClick={() => setCreateModalOpen(false)} aria-label="Close"><Icon name="x" size={16} /></button>
            </div>
            <form onSubmit={handleCreateTransfer}>
              <div className={styles.modalBody}>
                {/* 1. Route */}
                {warehouseChoices ? <section className={styles.restockRoute}>
                  <label className={styles.field}><span>Supplying warehouse</span>
                    <select required value={newOrigin} onChange={(event) => setNewOrigin(event.target.value)}>
                      <option value="">Choose a warehouse</option>
                      {warehouseChoices.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.type === 'MAIN_WAREHOUSE' ? 'Main warehouse' : 'Sub-warehouse'}</option>)}
                    </select>
                  </label>
                  <div><small>Deliver to</small><strong>{locationName(newDest)}</strong></div>
                  {!warehouseChoices.length && <p>No active supplying warehouses are available for this store.</p>}
                </section> : <section className={styles.formSection}>
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
                </section>}

                {/* 2. Products */}
                <section className={styles.formSection}>
                  <h3>{!manualRestock && <span>2</span>} Products {draftItems.length > 0 && <em>{draftItems.length} selected</em>}</h3>
                  <label className={styles.field}><span>Find a product</span><input type="search" placeholder="Search name or SKU" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} /></label>
                  <div className={styles.productGrid}>
                    {catalog.filter((product) => draft[product.sku] || `${product.name} ${product.sku}`.toLowerCase().includes(productSearch.trim().toLowerCase())).map((p) => {
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
                              <span className={styles.qtyTotal}><small>Total</small><b>{shipmentQuantity(q.cartons * p.unitsPerCarton + (p.unitsPerCarton > 1 ? 0 : q.loose), p.baseUnit, p.unitsPerCarton)}</b></span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* 3. Delivery */}
                {!manualRestock && <section className={styles.formSection}>
                  <h3><span>3</span> Delivery</h3>
                  <p>Carrier and tracking details can be recorded after the transfer is created.</p>
                  <div className={styles.whenRow}>
                    <div className={styles.segmented} role="group" aria-label="When to send">
                      <button type="button" className={dispatchNow ? styles.segOn : ''} onClick={() => setDispatchNow(true)} aria-pressed={dispatchNow}><Icon name="send" size={14} /> Send now</button>
                      <button type="button" className={!dispatchNow ? styles.segOn : ''} onClick={() => setDispatchNow(false)} aria-pressed={!dispatchNow}><Icon name="clock" size={14} /> Save, send later</button>
                    </div>
                    <input className={styles.noteInput} value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Reason (optional), e.g. weekend restock" aria-label="Reason" />
                  </div>
                </section>}
                {createError && <p className={styles.formError}><Icon name="alert" size={14} /> {createError}</p>}
              </div>
              <div className={styles.modalFoot}>
                <span className={styles.footSummary}>{draftTotal} units · {warehouseChoices?.find((location) => location.id === newOrigin)?.name ?? (newOrigin ? locationName(newOrigin) : 'Select source')} <ArrowRight size="1em" className="inline-icon" aria-hidden="true" /> {locationName(newDest)}</span>
                <button type="button" className={styles.ghostButton} disabled={isCreatingBusy} onClick={() => setCreateModalOpen(false)}>Cancel</button>
                <button type="submit" disabled={isCreatingBusy || (manualRestock && (!newOrigin || !draftItems.length))} className={styles.primaryButton}><Icon name={dispatchNow ? 'send' : 'check'} size={15} /> {isCreatingBusy ? 'Saving…' : manualRestock ? 'Send restock request' : dispatchNow ? 'Create & submit' : 'Save draft'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {reasonAction && <ReasonDialog action={reasonAction} onClose={() => setReasonAction(null)} />}
    </div>
  );
}
