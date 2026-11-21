'use client';

import React, { useEffect, useRef } from 'react';
import styles from './settings.module.css';

// ---------- Icons (simple 24px stroke icons, same style as the other pages) ----------
const PATHS: Record<string, React.ReactNode> = {
  sound: <><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M14 9l2 2" /></>,
  pin: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 12h.01M12 12h.01M17 12h.01" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  printer: <><path d="M6 9V2h12v7" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v8H6z" /></>,
  scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h10" /></>,
  box: <><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8M12 13v8" /></>,
  receipt: <><path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
  truck: <><path d="M2 6h11v10H2zM13 10h4l4 4v2h-8" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  store: <><path d="M3 9 5 4h14l2 5M4 9v11h16V9" /><path d="M3 9h18a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>,
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

// ---------- On/off switch with a title and a plain explanation ----------
export function ToggleRow({ title, detail, checked, onChange }: { title: string; detail: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={styles.toggleRow} onClick={() => onChange(!checked)}>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        className={styles.switch}
        onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      />
    </div>
  );
}

// ---------- Pick one option from a short list ----------
export interface ChoiceOption<T> { value: T; label: string; detail?: string }
export function ChoiceList<T extends string | number>({ name, label, hint, options, value, onChange, columns = 1 }: {
  name: string; label: string; hint?: string; options: ChoiceOption<T>[]; value: T; onChange: (v: T) => void; columns?: 1 | 2;
}) {
  return (
    <div className={styles.section} role="radiogroup" aria-label={label}>
      <p className={styles.sectionLabel}>{label}</p>
      {hint && <p className={styles.sectionHint}>{hint}</p>}
      <div className={columns === 2 ? styles.choicesTwo : styles.choices}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label key={String(o.value)} className={`${styles.choice} ${on ? styles.choiceOn : ''}`}>
              <input type="radio" name={name} checked={on} onChange={() => onChange(o.value)} />
              <i />
              <span>
                <strong>{o.label}</strong>
                {o.detail && <small>{o.detail}</small>}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Number with − / + buttons ----------
export function NumberField({ label, hint, value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, step = 1, unit }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <div className={styles.inputWrap}>
        {unit === '₹' && <em>₹</em>}
        <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(clamp(Number(e.target.value)))} />
        {unit && unit !== '₹' && <em>{unit}</em>}
        <button type="button" className={styles.stepper} aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))}>−</button>
        <button type="button" className={styles.stepper} aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + step))}>+</button>
      </div>
      {hint && <small>{hint}</small>}
    </label>
  );
}

// ---------- Right-side panel (same pattern as the attendance worker view) ----------
export function SettingsDrawer({ icon, title, subtitle, onClose, footer, children }: {
  icon: string; title: string; subtitle: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.drawerHead}>
          <span className={styles.rowIcon}><Icon name={icon} /></span>
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button ref={closeRef} type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className={styles.drawerBody}>{children}</div>
        <footer className={styles.drawerFoot}>
          {footer ?? (
            <>
              <small><Icon name="check" size={14} /> Changes save automatically</small>
              <button type="button" className={styles.primaryButton} onClick={onClose}>Done</button>
            </>
          )}
        </footer>
      </aside>
    </div>
  );
}
