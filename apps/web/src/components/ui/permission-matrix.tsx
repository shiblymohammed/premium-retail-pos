import styles from '@/app/staff-records/records.module.css';

const categories = { sales: 'Sales', cash: 'Cash', stock: 'Inventory', products: 'Catalogue', transfers: 'Transfers',
  purchasing: 'Purchasing', customers: 'Customer accounts', staff: 'Team', attendance: 'Attendance', payroll: 'Payroll' };

export function PermissionMatrix({ definitions, overrides, setOverrides, disabled, role, onOffLabels }: {
  definitions: Record<string, string>;
  overrides: Record<string, boolean>;
  setOverrides: (update: (current: Record<string, boolean>) => Record<string, boolean>) => void;
  disabled?: boolean;
  role?: string;
  onOffLabels?: boolean;
}) {
  return <div className={styles.grid}>{Object.entries(categories).map(([prefix, title]) => <fieldset className={styles.panel} key={prefix} disabled={disabled}>
    <legend>{title}</legend>
    {Object.entries(definitions).filter(([key]) => key.startsWith(prefix + '.')).map(([key, label]) => <div className={styles.fields} key={key}>
      <label>{label}<select value={overrides[key] === undefined ? 'default' : overrides[key] ? 'allow' : 'deny'}
        onChange={(event) => {
          const value = event.target.value;
          setOverrides((current) => {
            const next = { ...current };
            if (value === 'default') delete next[key];
            else next[key] = value === 'allow';
            return next;
          });
        }}>
        <option value="default">{key === 'products.prices' && role === 'ADMIN' ? 'Use role default (allow selling prices)' : 'Use role default'}</option>
        <option value="allow">{onOffLabels ? 'On' : 'Allow'}</option>
        <option value="deny">{onOffLabels ? 'Off' : 'Deny'}</option>
      </select></label>
    </div>)}
  </fieldset>)}</div>;
}
