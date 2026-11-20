'use client';

import React, { useEffect, useRef, useState } from 'react';
import styles from './pill-dropdown.module.css';

export interface PillDropdownOption<T extends string> {
  value: T;
  label: string;
}

export interface PillDropdownProps<T extends string> {
  value: T;
  options: PillDropdownOption<T>[];
  onChange: (next: T) => void;
  /** Small uppercase heading at the top of the list. */
  heading: string;
  ariaLabel: string;
  icon?: React.ReactNode;
  /** Text shown on the button; defaults to the selected option's label. */
  buttonLabel?: string;
  /** Extra content under the options (e.g. custom date inputs). */
  footer?: React.ReactNode;
  align?: 'left' | 'right';
  /** Locks the control (e.g. while an audit freezes the location). */
  disabled?: boolean;
  /** Tooltip, useful to explain why the control is disabled. */
  title?: string;
}

/** Pill button + white option list, matching the top-bar location dropdown. */
export function PillDropdown<T extends string>({
  value,
  options,
  onChange,
  heading,
  ariaLabel,
  icon,
  buttonLabel,
  footer,
  align = 'right',
  disabled = false,
  title,
}: PillDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.button}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {icon && <span className={styles.icon}>{icon}</span>}
        <span>{buttonLabel ?? current?.label ?? ''}</span>
        <span className={styles.caret}>▼</span>
      </button>
      {open && !disabled && (
        <div className={`${styles.menu} ${align === 'left' ? styles.menuLeft : ''}`} role="listbox" aria-label={ariaLabel}>
          <div className={styles.heading}>{heading}</div>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={`${styles.item} ${selected ? styles.itemActive : ''}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {selected && <span className={styles.check}>✓</span>}
              </button>
            );
          })}
          {footer && <div className={styles.footer}>{footer}</div>}
        </div>
      )}
    </div>
  );
}

export default PillDropdown;
