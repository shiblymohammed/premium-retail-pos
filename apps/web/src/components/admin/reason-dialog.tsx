'use client';

import { useId, useState, type FormEvent } from 'react';
import { AdminModal } from './admin-modal';

export type ReasonAction = {
  title: string;
  description?: string;
  submit: (reason: string) => Promise<void>;
};

export function ReasonDialog({ action, onClose }: { action: ReasonAction; onClose: () => void }) {
  const id = useId();
  const [reason, setReason] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) return;
    onClose();
    void action.submit(reason.trim());
  }

  return <AdminModal isOpen title={action.title} subtitle={action.description} onClose={onClose} footer={<>
    <button className="admin-secondary" type="button" onClick={onClose}>Cancel</button>
    <button className="admin-primary" type="submit" form={id} disabled={!reason.trim()}>Confirm</button>
  </>}>
    <form id={id} onSubmit={submit}>
      <label className="admin-reason">Reason<textarea autoFocus required rows={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    </form>
  </AdminModal>;
}
