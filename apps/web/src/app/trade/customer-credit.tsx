'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AdminModal } from '@/components/admin';
import { UserPlus } from 'lucide-react';
import tradeStyles from './trade.module.css';
import { Feedback } from '@/components/ui/feedback';
import { money } from '../staff-records/records-api';
import styles from '../staff-records/records.module.css';
import { tradeRequest } from './trade-api';

type Account = { id: string; name: string; code: string; currency: string };
type Ledger = { balance: string; entries: Array<{ id: string; kind: string; amount: string; reference: string; note: string; createdAt: string; actor: { email: string } }> };
const kindLabels = { CHARGE: 'Charge', PAYMENT: 'Payment', CREDIT: 'Credit adjustment' } as const;

export function CustomerCredit({ token, locationId }: { token: string; locationId: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState('');
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<keyof typeof kindLabels>('CHARGE');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const account = accounts.find((value) => value.id === selected);

  useEffect(() => {
    const controller = new AbortController();
    void tradeRequest<Account[]>(`/trade/customers?locationId=${encodeURIComponent(locationId)}`, token, controller.signal)
      .then((rows) => { setAccounts(rows); setSelected((current) => rows.some((value) => value.id === current) ? current : rows[0]?.id ?? ''); })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [token, locationId, reload]);

  useEffect(() => {
    if (!selected) return;
    setLedger(null);
    const controller = new AbortController();
    void tradeRequest<Ledger>(`/trade/customers/${selected}/entries`, token, controller.signal)
      .then(setLedger).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [token, selected, reload]);

  async function save(event: FormEvent, addEntry: boolean) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (addEntry) {
        await tradeRequest(`/trade/customers/${selected}/entries`, token, undefined, { kind, amount, reference, note });
        setAmount(''); setReference(''); setNote('');
      } else {
        const saved = await tradeRequest<Account>('/trade/customers', token, undefined, { name, code, locationId });
        setAccounts((rows) => [...rows, saved]);
        setSelected(saved.id); setName(''); setCode(''); setCreateOpen(false);
      }
      setReload((value) => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the ledger entry.'); }
    finally { setBusy(false); }
  }

  return <section className={tradeStyles.surface}>
    <header className={tradeStyles.sectionHeader}>
      <h2>Customer credit ledger</h2>
      <button type="button" className="admin-primary" disabled={busy} onClick={() => { setError(''); setCreateOpen(true); }}>
        <UserPlus size={16} aria-hidden="true" /> Add account
      </button>
    </header>
    {error && !createOpen && <Feedback tone="error">{error}</Feedback>}
    {createOpen && <AdminModal isOpen title="Add customer account" badgeIcon={<UserPlus size={20} aria-hidden="true" />}
      onClose={() => { if (!busy) setCreateOpen(false); }} footer={<>
        <button type="button" className="admin-secondary" disabled={busy} onClick={() => setCreateOpen(false)}>Cancel</button>
        <button type="submit" form="customer-account-form" className="admin-primary" disabled={busy}>{busy ? 'Saving…' : 'Save account'}</button>
      </>}>
      <form id="customer-account-form" className={tradeStyles.orderForm} onSubmit={(event) => void save(event, false)}>
        {error && <Feedback tone="error">{error}</Feedback>}
        <label className={tradeStyles.field}>Customer name<input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className={tradeStyles.field}>Customer code<input required maxLength={120} value={code} onChange={(event) => setCode(event.target.value)} /></label>
      </form>
    </AdminModal>}
    {accounts.length > 0 && <div className={styles.fields}><label>Customer account<select value={selected} disabled={busy} onChange={(e) => {
      setSelected(e.target.value); setAmount(''); setReference(''); setNote('');
    }}>
      {accounts.map((value) => <option key={value.id} value={value.id}>{value.name} · {value.code}</option>)}
    </select></label></div>}
    {account && ledger && <>
      <header className={tradeStyles.orderHeader}>
        <div><strong>{account.name}</strong><p>{account.code}</p></div>
        <strong>Outstanding balance · {money(ledger.balance, account.currency)}</strong>
      </header>
      <form className={styles.fields} onSubmit={(e) => void save(e, true)}>
        <label>Entry type<select value={kind} onChange={(e) => setKind(e.target.value as keyof typeof kindLabels)}>
          {Object.entries(kindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Amount<input required type="number" min="0.01" max="9999999999.99" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label>Document reference<input required maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
        <label>Reason<input required maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button className="admin-primary" disabled={busy}>Post entry</button>
      </form>
      <div className={styles.scroll}><table aria-label="Customer credit activity"><thead><tr><th>Date</th><th>Entry</th><th>Amount</th><th>Reference</th><th>Reason</th><th>Recorded by</th></tr></thead>
        <tbody>{ledger.entries.map((entry) => <tr key={entry.id}>
          <td>{new Date(entry.createdAt).toLocaleString()}</td><td>{kindLabels[entry.kind as keyof typeof kindLabels]}</td>
          <td>{money(entry.amount, account.currency)}</td><td>{entry.reference}</td><td>{entry.note}</td><td>{entry.actor.email}</td>
        </tr>)}</tbody></table></div>
    </>}
  </section>;
}
