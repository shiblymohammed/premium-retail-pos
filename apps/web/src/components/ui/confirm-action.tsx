'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export function ConfirmAction({ title, children, confirmLabel, cancelLabel = 'Go back', onConfirm, onCancel }: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    element.showModal();
    cancel.current?.focus();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="device-lock" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); onCancel(); }}
    onKeyDown={(event) => event.stopPropagation()}>
    <h2 id={titleId}>{title}</h2>
    <div id={descriptionId}>{children}</div>
    <div className="device-lock-actions">
      <button ref={cancel} type="button" className="admin-secondary" onClick={onCancel}>{cancelLabel}</button>
      <button type="button" className="admin-primary" onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </dialog>;
}
