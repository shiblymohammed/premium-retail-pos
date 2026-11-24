'use client';

import { Ellipsis } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function AdminActionMenu({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const open = anchor !== null;

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector('button')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) setAnchor(null);
    };
    const reposition = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      const next = trigger.current?.getBoundingClientRect();
      setAnchor(next && next.bottom > 0 && next.top < window.innerHeight ? next : null);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const showAbove = anchor && window.innerHeight - anchor.bottom < Math.min(310, anchor.top);
  const room = anchor ? (showAbove ? anchor.top : window.innerHeight - anchor.bottom) - 16 : 0;

  function close(restoreFocus: boolean) {
    setAnchor(null);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  return <>
    <button ref={trigger} type="button" className="admin-action-trigger" title={label} aria-label={label}
      aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={(event) => { event.stopPropagation(); setAnchor(open ? null : event.currentTarget.getBoundingClientRect()); }}>
      <Ellipsis size={18} aria-hidden="true" />
    </button>
    {anchor && createPortal(
      <div ref={panel} id={id} role="group" aria-label={label} className="admin-action-menu"
        style={{
          top: showAbove ? undefined : anchor.bottom + 6,
          bottom: showAbove ? window.innerHeight - anchor.top + 6 : undefined,
          right: Math.max(8, Math.min(window.innerWidth - 248, window.innerWidth - anchor.right)),
          maxHeight: room,
        }}
        onClick={(event) => { event.stopPropagation(); if ((event.target as HTMLElement).closest('button')) close(true); }}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) close(false); }}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); close(true); } }}>
        {children}
      </div>,
      document.body,
    )}
  </>;
}
