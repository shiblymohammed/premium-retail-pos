'use client';

import { Info } from 'lucide-react';
import { useId, useState } from 'react';

export function InfoHint({ label, children }: { label: string; children: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  function dismiss() {
    setOpen(false);
    setDismissed(true);
  }

  return (
    <span className="info-hint" data-dismissed={dismissed} onMouseEnter={() => setDismissed(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onFocus={() => setDismissed(false)}
        onBlur={dismiss}
        onClick={() => { if (open) dismiss(); else { setDismissed(false); setOpen(true); } }}
        onKeyDown={(event) => { if (event.key === 'Escape') dismiss(); }}
      >
        <Info size={16} aria-hidden="true" />
      </button>
      <span className="info-hint-content" id={id} data-open={open}>{children}</span>
    </span>
  );
}
