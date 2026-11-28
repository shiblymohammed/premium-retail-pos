import { useId } from 'react';
import { permissionCategories } from '@/components/ui/permission-matrix';
import styles from './permissions.module.css';

type Setting = 'default' | 'on' | 'off';

type PermissionSwitch = {
  key: string;
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

const settings: ReadonlyArray<{ value: Setting; label: string }> = [
  { value: 'default', label: 'Role default' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

export function PermissionEditor({ definitions, overrides, setOverrides, switches, role, disabled }: {
  definitions: Record<string, string>;
  overrides: Record<string, boolean>;
  setOverrides: (update: (current: Record<string, boolean>) => Record<string, boolean>) => void;
  switches: PermissionSwitch[];
  role: string;
  disabled: boolean;
}) {
  const identifier = useId();
  const entries = [
    ...switches.map((item) => ({
      key: item.key,
      label: item.label,
      value: item.enabled ? 'on' : 'off',
      options: settings.slice(1),
      update: (value: Setting) => item.onChange(value === 'on'),
    })),
    ...Object.entries(definitions).map(([key, label]) => ({
      key,
      label,
      value: overrides[key] === undefined ? 'default' : overrides[key] ? 'on' : 'off',
      options: settings,
      update: (value: Setting) => setOverrides((current) => {
        const next = { ...current };
        if (value === 'default') delete next[key];
        else next[key] = value === 'on';
        return next;
      }),
    })),
  ];
  const categories = Object.entries(permissionCategories).map(([prefix, title]) => ({
    title,
    rows: entries.filter((entry) => entry.key.startsWith(prefix + '.')),
  }));

  return <div className={styles.groups}>
    {categories.filter(({ rows }) => rows.length).map(({ title, rows }) => (
      <fieldset key={title} className={styles.group} disabled={disabled}>
        <legend>{title}</legend>
        {rows.map(({ key, label, value, options, update }) => (
          <div key={key} className={styles.permissionRow}>
            <span id={identifier + key}>{label}
              {key === 'products.prices' && role === 'ADMIN' && value === 'default' && <small>Role default allows selling prices</small>}
            </span>
            <div className={styles.segments} role="radiogroup" aria-labelledby={identifier + key}>
              {options.map((option) => (
                <label key={option.value}>
                  <input type="radio" name={identifier + key} value={option.value} checked={value === option.value}
                    onChange={() => update(option.value)} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
    ))}
  </div>;
}
