import { ClipboardCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminModal } from '@/components/admin';
import { Feedback } from '@/components/ui/feedback';
import styles from './permissions.module.css';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export const directPermissionLabels = {
  canCancelSales: 'Cancel finalized bills',
  canProcessReturns: 'Process customer returns',
  canCountStockAudits: 'Enter stock counts',
};

type Entry = {
  id: string;
  targetId: string;
  targetEmail: string | null;
  actor: { id: string; email: string };
  createdAt: string;
  beforeValue: string | null;
  afterValue: string | null;
  reason: string | null;
};

function readValues(value: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = value ? JSON.parse(value) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function setting(value: unknown) {
  return value === true ? 'On' : value === false ? 'Off' : 'Role default';
}

export function PermissionAudit({ token, definitions, onClose }: {
  token: string;
  definitions: Record<string, string>;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const labels: Record<string, string> = { ...definitions, ...directPermissionLabels };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const query = cursor ? '?' + new URLSearchParams({ cursor }) : '';
    void fetch(API + '/users/permission-audit' + query, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('Could not load permission history.');
      const { data } = await response.json() as { data: { entries: Entry[]; nextCursor: string | null } };
      if (!controller.signal.aborted) {
        setEntries((previous) => cursor ? [...previous, ...data.entries] : data.entries);
        setNextCursor(data.nextCursor);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setError('Could not load permission history.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [token, cursor, attempt]);

  return <AdminModal isOpen title="Permission audit log" maxWidth="760px" badgeIcon={<ClipboardCheck size={20} aria-hidden="true" />}
    onClose={onClose} footer={<button type="button" className="admin-secondary" onClick={onClose}>Close</button>}>
    {error && <Feedback tone="error" action={<button type="button" className="admin-secondary" onClick={() => setAttempt((value) => value + 1)}>Retry</button>}>{error}</Feedback>}
    {loading && <p role="status">Loading permission history…</p>}
    {!loading && !error && !entries.length && <p>No permission changes have been recorded yet.</p>}
    <ol className={styles.auditEntries}>
      {entries.map((entry) => {
        const before = readValues(entry.beforeValue);
        const after = readValues(entry.afterValue);
        const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key]);
        return <li key={entry.id} className={styles.auditEntry}>
          <header>
            <strong>{entry.targetEmail ?? entry.targetId}</strong>
            <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>
          </header>
          <small>Changed by {entry.actor.email}</small>
          {changed.length ? <ul>{changed.map((key) => <li key={key}>{labels[key] ?? key} · {setting(before[key])} → {setting(after[key])}</li>)}</ul>
            : <p>No permission values changed.</p>}
          {entry.reason && <p><strong>Reason</strong> {entry.reason}</p>}
        </li>;
      })}
    </ol>
    {nextCursor && !error && <button type="button" className="admin-secondary" disabled={loading}
      onClick={() => setCursor(nextCursor)}>Load older changes</button>}
  </AdminModal>;
}
