'use client';

import { ArrowLeft, ArrowRight, ArrowUpRight, Boxes, Building2, ClipboardCheck, LayoutDashboard, MapPin, ReceiptText, Settings, ShieldCheck, Store, UsersRound, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { isDeviceLocked } from '@/lib/device-lock';
import type { NavLink } from './nav-data';
import styles from './workspace-tour.module.css';

export const OPEN_WORKSPACE_TOUR = 'premium-retail-open-tour';

type Step = { title: string; description: string; icon: LucideIcon; href: string; label: string };

const overview: Step = { title: 'Start at Overview', description: 'See your key tasks and the activity you can access. Use the sidebar to move between sections.', icon: LayoutDashboard, href: '/dashboard', label: 'Overview' };
const profile: Step = { title: 'Set up the company profile', description: 'Save the company name, currency, time zone, and invoice prefix before adding locations.', icon: Building2, href: '/admin/company?tab=profile', label: 'Company profile' };
const locations: Step = { title: 'Add your first location', description: 'Start with a central warehouse. Then add a store or sub-warehouse and select its parent. You can assign a manager when one is ready.', icon: MapPin, href: '/admin/company', label: 'Locations' };
const users: Step = { title: 'Add your team', description: 'Create each account with the appropriate role and locations so staff can sign in and start work.', icon: UsersRound, href: '/admin/users', label: 'Users' };
const permissions: Step = { title: 'Review staff permissions', description: 'Review who can process returns, void sales and carry out stock counts. The Users screen links to these settings after account creation.', icon: ShieldCheck, href: '/admin/sales-permissions', label: 'Permissions' };
const reports: Step = { title: 'Review store activity', description: 'Use dates and locations to narrow sales and inventory reports to what you are responsible for.', icon: ReceiptText, href: '/reports', label: 'Reports' };
const products: Step = { title: 'Check the catalogue and stock', description: 'Find a product or SKU and review available stock before planning a transfer or count.', icon: Boxes, href: '/products', label: 'Products' };
const transfers: Step = { title: 'Track stock transfers', description: 'Review transfers that need approval, dispatch, or receipt at your locations.', icon: MapPin, href: '/operations', label: 'Transfers' };
const counts: Step = { title: 'Check assigned stock counts', description: 'Open the selected location’s count. Record what is physically present and check whether a recount is needed.', icon: ClipboardCheck, href: '/audits', label: 'Stock Counts' };
const attendance: Step = { title: 'Record your shift', description: 'Check your assigned location and clock in or out.', icon: UsersRound, href: '/attendance', label: 'My Attendance' };
const checkout: Step = { title: 'Open checkout', description: 'Scan a barcode or search for an item, review the basket, and choose a payment method to complete the sale.', icon: Store, href: '/pos-terminal', label: 'Checkout' };
const settings: Step = { title: 'Set up this device', description: 'Review display preferences and set an optional unlock PIN. Come back here whenever you want to take this tour again.', icon: Settings, href: '/settings', label: 'Settings' };

const guides: Record<string, Step[]> = {
  SUPER_ADMIN: [profile, locations, users, permissions],
  ADMIN: [overview, users, permissions, reports],
  STORE_MANAGER: [overview, products, counts, reports],
  WAREHOUSE_MANAGER: [overview, products, transfers, counts],
  SUB_WAREHOUSE_MANAGER: [overview, products, transfers, counts],
  CASHIER: [attendance, checkout, settings],
  STAFF: [attendance, counts, settings],
};

export function WorkspaceTour({ userId, role, pathname, links }: { userId: string; role: string; pathname: string; links: NavLink[] }) {
  const key = `premium-retail-tour-v1:${userId}:${role}`;
  const steps = (guides[role] ?? [overview, settings]).filter((step) => links.some((link) => link.href === step.href.split('?')[0]));
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const dismissed = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const step = steps[Math.min(index, steps.length - 1)];

  useEffect(() => {
    const start = () => { setIndex(0); setOpen(true); };
    window.addEventListener(OPEN_WORKSPACE_TOUR, start);
    return () => window.removeEventListener(OPEN_WORKSPACE_TOUR, start);
  }, []);

  useEffect(() => {
    if (pathname !== '/dashboard' || steps.length === 0 || dismissed.current || isDeviceLocked(userId)) return;
    try {
      if (!window.localStorage.getItem(key)) setOpen(true);
    } catch { /* Settings can still open the tour. */ }
  }, [pathname, key, steps.length, userId]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
    if (open) heading.current?.focus({ preventScroll: true });
  }, [open, index]);

  function finish() {
    dismissed.current = true;
    try { window.localStorage.setItem(key, 'viewed'); } catch { /* The tour can still close. */ }
    setOpen(false);
  }

  if (!step) return null;
  const last = index >= steps.length - 1;
  const Icon = step.icon;

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="workspace-tour-title" aria-describedby="workspace-tour-description"
    onCancel={(event) => { event.preventDefault(); finish(); }}>
    <div className={styles.banner}>
      <span className={styles.icon}><Icon size={30} aria-hidden="true" /></span>
      <span>Workspace guide</span>
    </div>
    <div className={styles.content}>
      <div className={styles.progress} aria-label={`Step ${index + 1} of ${steps.length}`}>
        <span>Step {index + 1} of {steps.length}</span>
        <div aria-hidden="true">{steps.map((item, i) => <i key={item.title} data-filled={i <= index} />)}</div>
      </div>
      <h2 ref={heading} tabIndex={-1} id="workspace-tour-title">{step.title}</h2>
      <p id="workspace-tour-description">{step.description}</p>
      {pathname !== step.href && <Link className={styles.sectionLink} href={step.href} onClick={finish}>Open {step.label} <ArrowUpRight size={16} aria-hidden="true" /></Link>}
    </div>
    <footer className={styles.footer}>
      <button type="button" className={styles.skip} onClick={finish}>Skip tour</button>
      <div>
        {index > 0 && <button type="button" className="admin-secondary" onClick={() => setIndex(index - 1)}><ArrowLeft size={16} aria-hidden="true" /> Back</button>}
        <button type="button" className="admin-primary" onClick={() => last ? finish() : setIndex(index + 1)}>{last ? 'Finish' : 'Next'} <ArrowRight size={16} aria-hidden="true" /></button>
      </div>
    </footer>
  </dialog>;
}
