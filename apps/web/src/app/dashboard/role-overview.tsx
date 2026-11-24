'use client';

import { ArrowDownToLine, ArrowLeftRight, ArrowRight, Box, Camera, ClipboardCheck, Clock3, MapPin, PackageCheck, PackageSearch, ReceiptText, ScanBarcode, Settings2, Store, Truck, TriangleAlert, UsersRound, Warehouse, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AuthSession } from '@/lib/auth';
import { LOCATION_KEY } from '@/components/layout/nav-data';
import { metric, read, type Load } from './data';
import styles from './dashboard.module.css';

type Attendance = { location: { name: string }; status: 'NOT_STARTED' | 'WORKING' | 'COMPLETED'; nextAction: 'IN' | 'OUT' | null; targetStartTime: string | null; qrRequired: boolean };
type Terminal = { location: { name: string } };
type Location = { id: string; name: string; type: string; companyId?: string; company?: { currency: string; timezone?: string } };
type LocationDay = { localDate: string; employees: Array<{ isLate: boolean; status: string }> };
type Sales = { daily: Array<{ date: string; netSales: string | number }> };
type Stock = { totals: { lowStockVariants: number; negativeStockVariants: number; variants: number } };
type Transfer = { status: string; sourceLocationId: string; destLocationId: string; lines?: Array<{ damagedQtyBase?: number; shortQtyBase?: number; excessQtyBase?: number }> };
type Replenishment = { status: string; sourceLocationId?: string; sourceLocation?: { id: string } };
type Audit = { status: string };
type Desk = { day: Load<LocationDay>; sales: Load<Sales>; stock: Load<Stock>; transfers: Load<Transfer[]>; replenishments: Load<Replenishment[]>; audits: Load<Audit[]>; company: Load<{ currency: string }> };
type WorkItem = { label: string; value: Load<string | number>; note: string; href: string; icon: LucideIcon };

function TaskCards({ items }: { items: WorkItem[] }) {
  return <div className={styles.deskCards}>{items.map(({ label, value, note, href, icon: Icon }) => (
    <Link href={href} key={label} className={styles.deskCard}>
      <span className={styles.deskCardTop}><i><Icon size={18} aria-hidden="true" /></i><ArrowRight size={15} aria-hidden="true" /></span>
      <span>{label}</span><strong data-unavailable={value == null}>{metric(value)}</strong><small>{note}</small>
    </Link>
  ))}</div>;
}

function ResourceLink({ href, title, description, icon: Icon }: { href: string; title: string; description: string; icon: LucideIcon }) {
  return <Link href={href} className={styles.deskResource}><i><Icon size={19} aria-hidden="true" /></i><span><b>{title}</b><small>{description}</small></span><ArrowRight size={16} aria-hidden="true" /></Link>;
}

export function ShiftOverview({ session }: { session: AuthSession }) {
  const cashier = session.user.role === 'CASHIER';
  const [attendance, setAttendance] = useState<Load<Attendance>>();
  const [terminal, setTerminal] = useState<Load<Terminal>>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void read<Attendance>('/attendance/me/today', session.accessToken, controller.signal).then((result) => { if (!controller.signal.aborted) setAttendance(result); });
    if (cashier) void read<Terminal>('/pos/terminal/context', session.accessToken, controller.signal).then((result) => { if (!controller.signal.aborted) setTerminal(result); });
    return () => controller.abort();
  }, [cashier, session.accessToken, revision]);

  const shift = attendance === undefined ? 'Checking shift…' : !attendance ? 'Shift status unavailable' : {
    NOT_STARTED: 'Not clocked in', WORKING: 'Clocked in', COMPLETED: 'Shift completed',
  }[attendance.status];
  const location = terminal?.location.name ?? attendance?.location.name;
  const shiftAction = attendance?.nextAction === 'IN' ? 'Start shift' : attendance?.nextAction === 'OUT' ? 'Clock out' : attendance?.status === 'COMPLETED' ? 'View shift record' : 'Open attendance';

  return <main className={styles.page}>
    <header className={styles.overviewTitle}><div><h1>{cashier ? 'Cashier workspace' : 'My shift'}</h1><p>{cashier ? 'Start a sale or check your shift.' : 'Check in, check out and review today’s attendance.'}</p></div>{location && <span className={styles.deskScope}><MapPin size={16} aria-hidden="true" /> {location}</span>}</header>
    <div className={styles.deskSplit}>
      <section className={styles.deskHero} aria-label={cashier ? 'Checkout' : 'Attendance action'}>
        <div className={styles.deskHeroTop}><i>{cashier ? <ScanBarcode size={25} aria-hidden="true" /> : <Clock3 size={25} aria-hidden="true" />}</i><span>{cashier ? terminal ? 'Terminal assigned' : terminal === undefined ? 'Checking terminal…' : 'Terminal unavailable' : shift}</span></div>
        <h2>{cashier ? 'Start a sale' : shiftAction}</h2>
        <p>{cashier ? terminal ? `Your terminal is assigned to ${terminal.location.name}. Open checkout to scan or search for products.` : terminal === undefined ? 'Checking your terminal assignment.' : 'Ask a manager to verify your store and terminal assignment.' : attendance ? attendance.status === 'COMPLETED' ? 'Your punches for today are recorded.' : attendance.qrRequired ? 'Have the store QR code ready before you open attendance.' : 'Open attendance to record your punch for this shift.' : 'Open attendance to check your shift and location.'}</p>
        {cashier ? terminal && <Link href="/pos-terminal" className={styles.deskPrimary}>Start sale <ArrowRight size={17} aria-hidden="true" /></Link> : <Link href="/attendance" className={styles.deskPrimary}>{shiftAction} <ArrowRight size={17} aria-hidden="true" /></Link>}
        {cashier && terminal === null && <button type="button" className={styles.deskPrimary} onClick={() => { setTerminal(undefined); setRevision((value) => value + 1); }}>Check again <ArrowRight size={17} aria-hidden="true" /></button>}
        {cashier && terminal == null && <Link href="/pos-terminal" className={styles.offlineTerminal}>Open checkout for offline access</Link>}
      </section>
      <section className={styles.deskPanel}>
        <h2>{cashier ? 'Your shift' : 'Shift information'}</h2>
        <div className={styles.shiftStatus}><Clock3 size={18} aria-hidden="true" /><span><b>{shift}</b><small>{attendance?.targetStartTime ? `Scheduled start ${attendance.targetStartTime}` : attendance?.location.name ?? 'Assigned location pending'}</small></span></div>
        <ResourceLink href="/attendance" title={cashier ? shiftAction : 'Attendance history'} description={cashier ? 'View today’s shift and punches' : 'Review your recent workdays'} icon={Clock3} />
        {attendance && attendance.nextAction && <ResourceLink href="/attendance#shift" title="Scan attendance QR" description="Open the camera controls for your shift" icon={Camera} />}
        <ResourceLink href="/settings" title="Device settings" description="Manage your PIN and preferences" icon={Settings2} />
      </section>
    </div>
  </main>;
}

const transit = ['PARTIALLY_DISPATCHED', 'DISPATCHED', 'PARTIALLY_RECEIVED'];

function measure<T>(data: Load<T>, calculate: (value: T) => number): Load<number> {
  if (data === undefined) return undefined;
  return data === null ? null : calculate(data);
}

export function ManagerOverview({ session }: { session: AuthSession }) {
  const role = session.user.role;
  const store = role === 'STORE_MANAGER';
  const central = role === 'CENTRAL_MANAGER' || role === 'WAREHOUSE_MANAGER';
  const token = session.accessToken;
  const [locations, setLocations] = useState<Load<Location[]>>();
  const [scope, setScope] = useState('');
  const [desk, setDesk] = useState<Partial<Desk>>({});

  useEffect(() => {
    const controller = new AbortController();
    const sync = () => setScope(window.localStorage.getItem(LOCATION_KEY) ?? '');
    sync();
    window.addEventListener('premium-retail-location-change', sync);
    void read<Location[]>('/locations?isActive=true', token, controller.signal).then((result) => { if (!controller.signal.aborted) setLocations(result); });
    return () => { controller.abort(); window.removeEventListener('premium-retail-location-change', sync); };
  }, [token]);

  const location = locations?.find((item) => item.name === scope) ?? locations?.find((item) => session.user.locationIds?.includes(item.id)) ?? locations?.[0];

  useEffect(() => {
    if (!location) return;
    const controller = new AbortController();
    const { signal } = controller;
    const id = encodeURIComponent(location.id);
    setDesk({});
    function load<K extends keyof Desk>(key: K, path: string) {
      void read<NonNullable<Desk[K]>>(path, token, signal).then((value) => {
        if (!signal.aborted) setDesk((current) => ({ ...current, [key]: value }));
      });
    }
    load('stock', `/reports/stock?locationId=${id}`);
    load('transfers', '/transfers');
    load('audits', `/audits/locations/${id}/sessions`);
    if (store) {
      load('day', `/attendance/locations/${id}/today`);
      load('sales', `/reports/sales-summary?locationId=${id}`);
      if (!location.company && location.companyId) load('company', `/companies/${encodeURIComponent(location.companyId)}`);
    }
    if (central) load('replenishments', '/transfers/replenishment');
    return () => controller.abort();
  }, [location, token, store, central]);

  const label = store ? 'Store overview' : central ? 'Central warehouse overview' : 'Sub-warehouse overview';
  const transfers = desk.transfers?.filter((row) => row.sourceLocationId === location?.id || row.destLocationId === location?.id) ?? desk.transfers;
  const auditCount = measure(desk.audits, (rows) => rows.filter((row) => ['ACTIVE', 'SUBMITTED'].includes(row.status)).length);
  const lowStock = measure(desk.stock, (stock) => stock.totals.lowStockVariants);
  const stockDiscrepancies = measure(desk.stock, (stock) => stock.totals.negativeStockVariants);
  const late = measure(desk.day, (day) => day.employees.filter((entry) => entry.isLate).length);
  const companyCurrency = location?.company?.currency ?? desk.company?.currency;
  let todaysSales: Load<string> = desk.sales === undefined || desk.day === undefined ? undefined : null;
  if (desk.sales && desk.day && companyCurrency) {
    const amount = Number(desk.sales.daily.find((row) => row.date === desk.day?.localDate)?.netSales ?? 0);
    if (Number.isFinite(amount)) todaysSales = new Intl.NumberFormat('en', { style: 'currency', currency: companyCurrency }).format(amount);
  }
  const transferCount = (filter: (transfer: Transfer) => boolean) => measure(transfers, (rows) => rows.filter(filter).length);
  const items: WorkItem[] = store ? [
    { label: 'Net sales today', value: todaysSales, icon: ReceiptText, href: '/reports?tab=sales', note: 'Finalized sales for the store’s local day' },
    { label: 'Late check-ins today', value: late, icon: UsersRound, href: '/attendance/manage', note: 'Recorded arrivals after the scheduled start' },
    { label: 'Low stock variants', value: lowStock, icon: PackageSearch, href: '/products', note: 'At or below the reorder level' },
    { label: 'Transfers awaiting approval', value: transferCount((row) => row.status === 'PENDING_APPROVAL'), icon: ArrowLeftRight, href: '/operations', note: 'Open requests involving this store' },
  ] : central ? [
    { label: 'Dispatches to prepare', value: transferCount((row) => row.sourceLocationId === location?.id && ['APPROVED', 'PARTIALLY_DISPATCHED'].includes(row.status)), icon: Truck, href: '/operations', note: 'Approved stock still awaiting dispatch' },
    { label: 'Replenishment requests', value: measure(desk.replenishments, (rows) => rows.filter((row) => row.status === 'DRAFT' && (row.sourceLocation?.id ?? row.sourceLocationId) === location?.id).length), icon: PackageCheck, href: '/operations#replenishment-heading', note: 'Suggested transfers awaiting review' },
    { label: 'Negative stock balances', value: stockDiscrepancies, icon: TriangleAlert, href: '/products', note: 'Variants with available stock below zero' },
    { label: 'Open stock counts', value: auditCount, icon: ClipboardCheck, href: '/audits', note: 'Active counts and counts awaiting review' },
  ] : [
    { label: 'Incoming transfers', value: transferCount((row) => row.destLocationId === location?.id && transit.includes(row.status)), icon: ArrowDownToLine, href: '/operations', note: 'Inbound shipments still to receive' },
    { label: 'Receipt discrepancies', value: transferCount((row) => row.destLocationId === location?.id && Boolean(row.lines?.some((line) => (line.damagedQtyBase ?? 0) + (line.shortQtyBase ?? 0) + (line.excessQtyBase ?? 0) > 0))), icon: TriangleAlert, href: '/operations', note: 'Inbound records with missing, damaged or extra units' },
    { label: 'Open stock counts', value: auditCount, icon: ClipboardCheck, href: '/audits', note: 'Active counts and counts awaiting review' },
    { label: 'Low stock variants', value: lowStock, icon: PackageSearch, href: '/products', note: 'At or below the reorder level' },
  ];

  return <main className={styles.page}>
    <header className={styles.overviewTitle}><div><h1>{label}</h1><p>{store ? 'Sales, team and stock activity for the selected store.' : 'Stock and transfer work for the selected warehouse.'}</p></div>{location && <span className={styles.deskScope}><MapPin size={16} aria-hidden="true" /> {location.name}</span>}</header>
    {!location ? <section className={styles.deskPanel}><h2>{locations === undefined ? 'Loading locations…' : locations === null ? 'Locations unavailable' : 'No active location assigned'}</h2><p>{locations === null ? 'Retry the page to load your authorized locations.' : locations === undefined ? 'Checking your workspace access.' : 'Ask an administrator to assign a location to your account.'}</p></section> : <>
      <div className={styles.managerDesk}>
        <section className={styles.deskHero}>
          <div className={styles.deskHeroTop}><i>{store ? <Store size={25} aria-hidden="true" /> : <Warehouse size={25} aria-hidden="true" />}</i></div>
          <h2>{store ? 'Run today’s floor' : central ? 'Review dispatch work' : 'Receive incoming stock'}</h2>
          <p>{store ? 'Check today’s figures and follow up on sales, attendance and stock exceptions.' : central ? 'Review approved dispatches and replenishment requests before moving stock.' : 'Review inbound shipments and record any differences when stock arrives.'}</p>
          <Link className={styles.deskPrimary} href={store ? '/reports?tab=sales' : '/operations'}>{store ? 'Open sales report' : central ? 'Open transfers' : 'Review inbound transfers'} <ArrowRight size={17} aria-hidden="true" /></Link>
        </section>
        <section className={styles.deskWork}><h2>{store ? 'Today’s priorities' : 'Work queue'}</h2><TaskCards items={items} /></section>
        <section className={styles.deskPanel}><h2>Quick access</h2>
          <ResourceLink href={store ? '/attendance/manage' : '/operations'} title={store ? 'Attendance' : 'Transfers'} description={store ? 'Review the store’s shift records' : 'Open the transfer queue'} icon={store ? UsersRound : ArrowLeftRight} />
          <ResourceLink href="/products" title="Products & stock" description="Browse the catalogue and available stock" icon={Box} />
          <ResourceLink href="/audits" title="Stock counts" description="Open current and past counts" icon={ClipboardCheck} />
        </section>
      </div>
    </>}
  </main>;
}
