'use client';

import { useEffect, useState } from 'react';
import { Feedback } from '@/components/ui/feedback';
import { money, payFields, staffRequest, type PayrollRow } from '../staff-records/records-api';
import styles from '../staff-records/records.module.css';

type PayHistory = { firstName: string; lastName: string; employeeCode: string; location: { name: string }; payroll: PayrollRow[] };
export default function MyPayslipsPage() {
  const [history, setHistory] = useState<PayHistory | null>();
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void staffRequest<PayHistory | null>('/me/payroll', controller.signal).then((data) => {
      setHistory(data);
      setSelected(data?.payroll[0]?.id ?? '');
    }).catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, []);
  const record = history?.payroll.find((row) => row.id === selected);
  return <main className={`app-page ${styles.page}`}>
    <header className={styles.top}><h1>My payslips</h1></header>
    {error && <Feedback tone="error">{error}</Feedback>}
    {!error && history === undefined && <p role="status">Loading payslips…</p>}
    {!error && history !== undefined && !record && <p>No paid payslips are available.</p>}
    {history && record && <>
      <div className={styles.fields}><label>Pay period<select value={selected} onChange={(e) => setSelected(e.target.value)}>
        {history.payroll.map((row) => <option key={row.id} value={row.id}>{row.period}</option>)}
      </select></label></div>
      <article className={`${styles.panel} ${styles.payslip}`}>
        <header className={styles.top}><div><h2>Payslip · {record.period}</h2><p>{history.firstName} {history.lastName} · {history.employeeCode} · {history.location.name}</p></div>
          <button className={`admin-secondary ${styles.printButton}`} onClick={() => window.print()}>Print or save PDF</button>
        </header>
        <dl className={styles.facts}>
          {Object.entries(payFields).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{money(record[key as keyof typeof payFields], record.currency)}</dd></div>)}
          <div><dt>Net pay</dt><dd>{money(record.net, record.currency)}</dd></div>
          <div><dt>Payment reference</dt><dd>{record.paymentReference}</dd></div>
        </dl>
      </article>
    </>}
  </main>;
}
