'use client';

import {
  Bell,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Globe,
  Info,
  KeyRound,
  LayoutGrid,
  Lock,
  Mail,
  MapPin,
  Minus,
  Package,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  ScanBarcode,
  ShieldCheck,
  Store,
  TriangleAlert,
  Truck,
  UserRound,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import styles from './settings.module.css';

// ---------- Icons (simple 24px stroke icons, same style as the other pages) ----------
const ICON_COMPONENTS: Partial<Record<string, LucideIcon>> = {
  sound: Volume2,
  globe: Globe,
  lock: Lock,
  key: KeyRound,
  pin: MapPin,
  bell: Bell,
  printer: Printer,
  scan: ScanBarcode,
  box: Package,
  receipt: ReceiptText,
  truck: Truck,
  shield: ShieldCheck,
  grid: LayoutGrid,
  clock: Clock,
  user: UserRound,
  mail: Mail,
  store: Store,
  check: Check,
  close: X,
  chevron: ChevronDown,
  external: ExternalLink,
  info: Info,
  reset: RotateCcw,
  alert: TriangleAlert,
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Glyph = ICON_COMPONENTS[name];
  return Glyph ? <Glyph size={size} strokeWidth={1.8} aria-hidden="true" /> : null;
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
        <button type="button" className={styles.stepper} aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))}><Minus size="1em" className="inline-icon" aria-hidden="true" /></button>
        <button type="button" className={styles.stepper} aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + step))}><Plus size="1em" className="inline-icon" aria-hidden="true" /></button>
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
