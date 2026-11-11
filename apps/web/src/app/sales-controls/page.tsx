'use client';

import { FormEvent, useRef, useState } from 'react';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type SalePermissions = { role: string; canCancelSales: boolean; canProcessReturns: boolean };
type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  location: { name: string; company: { currency: string } };
  createdAt: string;
  cancelledAt: string | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  grossTotal: string;
  discountTotal: string;
  netTotal: string;
  payment?: { method: string };
  lines: Array<{
    id: string;
    quantityBaseUnits: number;
    returnedQuantityBaseUnits: number;
    variant: { sku: string; name: string; product: { name: string; baseUnit: string } };
  }>;
  returns: Array<{ returnNumber: string; refund?: { amount: string; method: string } | null }>;
  permissions: { canCancelSales: boolean; canProcessReturns: boolean };
};
type ReturnLine = { quantity: string; disposition: 'RESTOCKED' | 'QUARANTINED'; inspectionNotes: string };

async function errorMessage(response: Response) {
  try {
    const result = await response.json();
    return typeof result.message === 'string' ? result.message : 'Request failed';
  } catch {
    return `Request failed (${response.status})`;
  }
}

export default function SalesControlsPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [permissions, setPermissions] = useState<SalePermissions | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'CARD' | 'ONLINE' | 'OTHER'>('CASH');
  const [refundReference, setRefundReference] = useState('');
  const [confirmedGoodsReturned, setConfirmedGoodsReturned] = useState(false);
  const [returnLines, setReturnLines] = useState<Record<string, ReturnLine>>({});
  const [busy, setBusy] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pendingRef = useRef<{ key: string; method: 'PATCH' | 'POST'; url: string; body: string } | null>(null);

  const currency = (amount: number | string, currencyCode = invoice?.location.company.currency || 'INR') => new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(Number(amount) || 0);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json();
      const accessToken: string = result.data.accessToken;
      const permissionResponse = await fetch(`${API_BASE}/users/me/sales-permissions`, {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
      });
      if (!permissionResponse.ok) throw new Error(await errorMessage(permissionResponse));
      const ownPermissions = (await permissionResponse.json()).data as SalePermissions;
      if (!ownPermissions.canCancelSales && !ownPermissions.canProcessReturns) {
        throw new Error('Your account has no assigned cancellation or return permission.');
      }
      setToken(accessToken);
      setPermissions(ownPermissions);
      setPassword('');
      setNotice('Sale-control permissions verified by the server.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  }

  async function findInvoice(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!token || !invoiceNumber.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`${API_BASE}/sales/invoice/${encodeURIComponent(invoiceNumber.trim())}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const found = (await response.json()).data as Invoice;
      setInvoice(found);
      setReturnLines(Object.fromEntries(found.lines.map((line) => [line.id, { quantity: '', disposition: 'QUARANTINED', inspectionNotes: '' }])));
      setReason('');
      setRefundReference('');
      setRefundMethod('CASH');
      setConfirmedGoodsReturned(false);
    } catch (caught) {
      setInvoice(null);
      setError(caught instanceof Error ? caught.message : 'Could not find the invoice');
    } finally {
      setBusy(false);
    }
  }

  async function mutate(method: 'PATCH' | 'POST', url: string, bodyValue: Record<string, unknown>) {
    const body = JSON.stringify(bodyValue);
    if (!pendingRef.current) pendingRef.current = { key: crypto.randomUUID(), method, url, body };
    const pending = pendingRef.current;
    if (pending.method !== method || pending.url !== url || pending.body !== body) throw new Error('Retry the same action before changing its details.');
    setBusy(true);
    let retain = true;
    try {
      const response = await fetch(`${API_BASE}${url}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': pending.key },
        body: pending.body,
      });
      if (!response.ok) {
        retain = response.status >= 500;
        throw new Error(await errorMessage(response));
      }
      const result = await response.json();
      pendingRef.current = null;
      setRetryPending(false);
      return result.data;
    } catch (caught) {
      if (retain) setRetryPending(true);
      else pendingRef.current = null;
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  async function cancelSale() {
    if (!invoice || !reason.trim() || !confirmedGoodsReturned) return;
    if (!window.confirm(`Cancel ${invoice.invoiceNumber} and record a manual refund of ${currency(invoice.netTotal)}?`)) return;
    setError('');
    try {
      await mutate('PATCH', `/sales/${invoice.id}/cancel`, {
        reason: reason.trim(), refundMethod, goodsReturnedToStore: true,
        ...(refundReference.trim() ? { refundReference: refundReference.trim() } : {}),
      });
      await findInvoiceByNumber(invoice.invoiceNumber);
      setNotice('Sale cancelled. A manual refund record was saved; no money was sent by the app.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not cancel this sale');
    }
  }

  async function recordReturn() {
    if (!invoice || !reason.trim()) return;
    const lines = invoice.lines.flatMap((line) => {
      const selection = returnLines[line.id];
      const quantityBaseUnits = Number(selection?.quantity || 0);
      if (!Number.isSafeInteger(quantityBaseUnits) || quantityBaseUnits < 1) return [];
      return [{ saleLineId: line.id, quantityBaseUnits, disposition: selection.disposition, inspectionNotes: selection.inspectionNotes.trim() }];
    });
    if (!lines.length) { setError('Enter a return quantity for at least one invoice line.'); return; }
    if (lines.some((line) => line.inspectionNotes.length < 5)) { setError('Inspection notes of at least five characters are required for each returned line.'); return; }
    setError('');
    try {
      await mutate('POST', `/sales/${invoice.id}/returns`, {
        reason: reason.trim(), refundMethod,
        ...(refundReference.trim() ? { refundReference: refundReference.trim() } : {}),
        lines,
      });
      await findInvoiceByNumber(invoice.invoiceNumber);
      setNotice('Return recorded with inspection disposition. Any refund is recorded manually; no payment was initiated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record the return');
    }
  }

  async function findInvoiceByNumber(number: string) {
    const response = await fetch(`${API_BASE}/sales/invoice/${encodeURIComponent(number)}`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    const found = (await response.json()).data as Invoice;
    setInvoice(found);
    setReturnLines(Object.fromEntries(found.lines.map((line) => [line.id, { quantity: '', disposition: 'QUARANTINED', inspectionNotes: '' }])));
    setReason('');
    setConfirmedGoodsReturned(false);
  }

  function signOut() {
    setToken('');
    setPermissions(null);
    setInvoice(null);
    setError('');
    setNotice('');
    pendingRef.current = null;
    setRetryPending(false);
  }

  return <main className="discount-admin-shell">
    <header className="topbar"><div className="topbar-brand"><div className="brand-mark small">P</div><div><strong>Premium Retail</strong><span>SALE CONTROLS</span></div></div>{token ? <button className="text-button" disabled={retryPending} onClick={signOut}>Sign out</button> : <a className="text-button" href="/">POS terminal</a>}</header>
    {!token ? <div className="login-shell"><div className="login-card"><div className="brand-mark">P</div><div className="eyebrow">AUTHORIZED USERS</div><h1>Sale controls</h1><p className="muted">Sign in with an account assigned cancellation or return permission.</p><form className="login-form" onSubmit={signIn}><label htmlFor="sales-control-email">Email</label><input id="sales-control-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /><label htmlFor="sales-control-password">Password</label><input id="sales-control-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />{error && <div className="alert error">{error}</div>}<button className="primary-button full-width" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></div></div> : <div className="discount-admin-content">
      <a className="back-link" href="/">← POS terminal</a><div className="page-heading admin-heading"><div><div className="eyebrow">PERMISSION-CONTROLLED ACTIONS</div><h1>Returns & cancellations</h1><p>Returns require the original invoice and have no time limit. Refund methods are recorded only; the app does not process payments.</p></div><div className="admin-user-pill"><span>{permissions?.role}</span><strong>{[permissions?.canCancelSales && 'Cancel sales', permissions?.canProcessReturns && 'Process returns'].filter(Boolean).join(' · ')}</strong></div></div>
      <form className="invoice-search" onSubmit={findInvoice}><input value={invoiceNumber} disabled={retryPending} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="Original invoice number" required /><button className="small-action-button" disabled={busy || retryPending}>{busy ? 'Loading…' : 'Find invoice'}</button></form>
      {error && <div className="alert error">{error}</div>}{notice && <div className="alert success">{notice}</div>}
      {retryPending && <div className="alert stock-error">The server response was interrupted. Retry the same action to confirm its result; keep this page open.</div>}
      {invoice && <section className="limit-form-card sale-control-full-card"><div className="invoice-control-heading"><strong>{invoice.invoiceNumber}</strong><span>{invoice.status} · {invoice.location.name} · {new Date(invoice.createdAt).toLocaleString()}</span></div>{invoice.cancellationReason && <p className="field-hint">Cancelled {invoice.cancelledAt ? `on ${new Date(invoice.cancelledAt).toLocaleString()}` : ''}: {invoice.cancellationReason}</p>}<div className="invoice-control-totals"><span>Subtotal {currency(invoice.grossTotal)}</span><span>Discount {currency(invoice.discountTotal)}</span><strong>Total {currency(invoice.netTotal)}</strong></div><p className="field-hint">Original payment recorded as {invoice.payment?.method || 'unknown'}. Refund records are manual and do not initiate a transaction.</p>
        {invoice.returns.map((saleReturn) => <div className="prior-return" key={saleReturn.returnNumber}>{saleReturn.returnNumber} · {saleReturn.refund ? `${currency(saleReturn.refund.amount)} manual refund (${saleReturn.refund.method})` : 'No refund amount'}</div>)}
        {invoice.status === 'FINALIZED' && <><label className="control-field">Reason<textarea value={reason} disabled={retryPending} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Required reason for the sale control action" /></label><label className="control-field">Manual refund method<select value={refundMethod} disabled={retryPending} onChange={(event) => setRefundMethod(event.target.value as 'CASH' | 'CARD' | 'ONLINE' | 'OTHER')}><option value="CASH">Cash</option><option value="CARD">Card (manual)</option><option value="ONLINE">Online (manual)</option><option value="OTHER">Other</option></select></label><label className="control-field">Refund reference (optional)<input value={refundReference} disabled={retryPending} maxLength={120} onChange={(event) => setRefundReference(event.target.value)} placeholder="Do not enter card numbers" /></label>
          {invoice.permissions.canCancelSales && invoice.returns.length === 0 && <><label className="offline-confirm"><input type="checkbox" checked={confirmedGoodsReturned} disabled={retryPending} onChange={(event) => setConfirmedGoodsReturned(event.target.checked)} /> All goods are physically back at this store.</label><button className="danger-action-button" disabled={busy} onClick={() => void cancelSale()}>{retryPending ? 'Retry same cancellation' : `Cancel sale · ${currency(invoice.netTotal)} manual refund`}</button></>}
          {invoice.permissions.canProcessReturns && <div className="return-lines-form"><strong>Inspect returned items</strong>{invoice.lines.map((line) => { const remaining = line.quantityBaseUnits - line.returnedQuantityBaseUnits; const selection = returnLines[line.id] || { quantity: '', disposition: 'QUARANTINED' as const, inspectionNotes: '' }; if (!remaining) return null; return <div className="return-line-entry" key={line.id}><span>{line.variant.product.name} · {line.variant.name}<small>{remaining} {line.variant.product.baseUnit} remaining · {line.variant.sku}</small></span><input type="number" min="0" max={remaining} value={selection.quantity} disabled={retryPending} onChange={(event) => setReturnLines((current) => ({ ...current, [line.id]: { ...selection, quantity: event.target.value } }))} aria-label={`Quantity to return for ${line.variant.name}`} /><select value={selection.disposition} disabled={retryPending} onChange={(event) => setReturnLines((current) => ({ ...current, [line.id]: { ...selection, disposition: event.target.value as 'RESTOCKED' | 'QUARANTINED' } }))}><option value="QUARANTINED">Quarantine</option><option value="RESTOCKED">Inspected and restock</option></select><input value={selection.inspectionNotes} disabled={retryPending} maxLength={500} onChange={(event) => setReturnLines((current) => ({ ...current, [line.id]: { ...selection, inspectionNotes: event.target.value } }))} placeholder="Inspection notes (required)" aria-label={`Inspection notes for ${line.variant.name}`} /></div>; })}<button className="small-action-button" disabled={busy} onClick={() => void recordReturn()}>{retryPending ? 'Retry same return' : 'Record return'}</button></div>}
        </>}
      </section>}
    </div>}
  </main>;
}
