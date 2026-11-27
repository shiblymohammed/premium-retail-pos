'use client';

import { useId, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { AdminModal } from './admin-modal';
import { Feedback } from '@/components/ui/feedback';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export function PasswordDialog({ token, staff, onClose, onSaved }: {
  token: string;
  staff?: { id: string; email: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (newPassword !== confirmation) { setError('The new passwords do not match.'); return; }
    if (new TextEncoder().encode(newPassword).length > 72) { setError('Choose a password of no more than 72 UTF-8 bytes.'); return; }
    setBusy(true);
    setError('');
    try {
      const endpoint = staff ? `/users/${encodeURIComponent(staff.id)}/reset-password` : '/auth/change-password';
      const response = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(staff ? { newPassword } : { currentPassword, newPassword }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || 'Could not update the password.');
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the password.');
    } finally {
      setBusy(false);
    }
  }

  const title = staff ? 'Reset staff password' : 'Change password';
  return <AdminModal isOpen title={title} badgeIcon={<KeyRound size={20} aria-hidden="true" />}
    subtitle={staff ? `Set a new password for ${staff.email}. Their existing sessions will end.` : 'Your existing sessions will end after you save.'}
    onClose={() => { if (!busy) onClose(); }}
    footer={<>
      <button type="button" className="admin-secondary" disabled={busy} onClick={onClose}>Cancel</button>
      <button type="submit" form={formId} className="admin-primary" disabled={busy}>{busy ? 'Saving…' : title}</button>
    </>}>
    <form id={formId} onSubmit={save} className="admin-form-grid">
      {!staff && <label>Current password<input autoFocus required type="password" autoComplete="current-password" maxLength={72}
        value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={busy} /></label>}
      <label>New password<input autoFocus={Boolean(staff)} required type="password" autoComplete="new-password" minLength={12} maxLength={72}
        value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={busy} /></label>
      <label>Confirm new password<input required type="password" autoComplete="new-password" minLength={12} maxLength={72}
        value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /></label>
      {error && <Feedback tone="error">{error}</Feedback>}
    </form>
  </AdminModal>;
}
