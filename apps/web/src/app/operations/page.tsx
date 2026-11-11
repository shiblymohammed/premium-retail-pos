'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

type RequestPreset = {
  phase: string;
  title: string;
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  body?: string;
  note: string;
  auth?: boolean;
};

const presets: RequestPreset[] = [
  { phase: 'Phase 1 · Foundation', title: 'API liveness', method: 'GET', path: '/health/liveness', note: 'Confirms the API process is responding.', auth: false },
  { phase: 'Phase 1 · Foundation', title: 'Database readiness', method: 'GET', path: '/health/readiness', note: 'Checks the API database connection.', auth: false },
  { phase: 'Phase 1 · Foundation', title: 'Sign in', method: 'POST', path: '/auth/login', body: '{\n  "email": "admin@premiumretail.com",\n  "password": "SuperAdmin@123"\n}', note: 'Authenticates and returns access and refresh tokens.', auth: false },
  { phase: 'Phase 1 · Foundation', title: 'Refresh session', method: 'POST', path: '/auth/refresh', body: '{\n  "refreshToken": "PASTE_REFRESH_TOKEN"\n}', note: 'Rotates the active refresh-token session.' },

  { phase: 'Phase 2 · Organization', title: 'List companies', method: 'GET', path: '/companies', note: 'Super Admin only.' },
  { phase: 'Phase 2 · Organization', title: 'Create company', method: 'POST', path: '/companies', body: '{\n  "name": "Demo Retail Group",\n  "currency": "INR",\n  "timezone": "Asia/Kolkata",\n  "invoicePrefix": "DEMO"\n}', note: 'Creates company settings. Prefix must be unique.' },
  { phase: 'Phase 2 · Organization', title: 'Company details', method: 'GET', path: '/companies/PASTE_COMPANY_ID', note: 'Review company configuration.' },
  { phase: 'Phase 2 · Organization', title: 'Company statistics', method: 'GET', path: '/companies/PASTE_COMPANY_ID/statistics', note: 'Admin, Central Manager, or Super Admin.' },
  { phase: 'Phase 2 · Organization', title: 'Update company', method: 'PATCH', path: '/companies/PASTE_COMPANY_ID', body: '{\n  "name": "Updated Demo Retail Group",\n  "currency": "INR",\n  "timezone": "Asia/Kolkata"\n}', note: 'Super Admin only.' },
  { phase: 'Phase 2 · Organization', title: 'List locations', method: 'GET', path: '/locations', note: 'Returns locations visible to the signed-in role.' },
  { phase: 'Phase 2 · Organization', title: 'Create location', method: 'POST', path: '/locations', body: '{\n  "companyId": "PASTE_COMPANY_ID",\n  "name": "Demo Store",\n  "type": "RETAIL_STORE",\n  "parentId": "PASTE_PARENT_LOCATION_ID"\n}', note: 'Use MAIN_WAREHOUSE, SUB_WAREHOUSE, or RETAIL_STORE.' },
  { phase: 'Phase 2 · Organization', title: 'Location details', method: 'GET', path: '/locations/PASTE_LOCATION_ID', note: 'Location-scoped detail lookup.' },
  { phase: 'Phase 2 · Organization', title: 'Deactivate location', method: 'PATCH', path: '/locations/PASTE_LOCATION_ID/deactivate', body: '{}', note: 'Fails while active children, transfers, or stock balances remain.' },
  { phase: 'Phase 2 · Organization', title: 'List users', method: 'GET', path: '/users', note: 'Admin and Super Admin only.' },
  { phase: 'Phase 2 · Organization', title: 'Create user', method: 'POST', path: '/users', body: '{\n  "email": "new.cashier@example.com",\n  "password": "ChangeThis123!",\n  "role": "CASHIER",\n  "locationIds": ["PASTE_STORE_ID"]\n}', note: 'Password must be 12–72 characters. Pick a valid role.' },
  { phase: 'Phase 2 · Organization', title: 'Update user', method: 'PATCH', path: '/users/PASTE_USER_ID', body: '{\n  "role": "STORE_MANAGER",\n  "locationIds": ["PASTE_STORE_ID"]\n}', note: 'Admin or Super Admin; role and location assignment rules apply.' },
  { phase: 'Phase 2 · Organization', title: 'Deactivate user', method: 'PATCH', path: '/users/PASTE_USER_ID/deactivate', body: '{}', note: 'Soft deactivates the account and blocks future sign-in.' },
  { phase: 'Phase 2 · Organization', title: 'List employees', method: 'GET', path: '/employees', note: 'Admin and Super Admin only; optional ?locationId=… filter.' },
  { phase: 'Phase 2 · Organization', title: 'Create employee', method: 'POST', path: '/employees', body: '{\n  "userId": "PASTE_USER_ID",\n  "employeeCode": "EMP-100",\n  "firstName": "Asha",\n  "lastName": "Kumar",\n  "locationId": "PASTE_LOCATION_ID",\n  "hireDate": "2026-11-07"\n}', note: 'Links an employee profile to a user and workplace.' },
  { phase: 'Phase 2 · Organization', title: 'Employee details', method: 'GET', path: '/employees/PASTE_EMPLOYEE_ID', note: 'Role and location scoped employee lookup.' },
  { phase: 'Phase 2 · Organization', title: 'Update employee', method: 'PATCH', path: '/employees/PASTE_EMPLOYEE_ID', body: '{\n  "phone": "+91 9000000000",\n  "employeeCode": "EMP-100"\n}', note: 'Updates employee profile fields while enforcing location scope.' },
  { phase: 'Phase 2 · Organization', title: 'Deactivate employee', method: 'PATCH', path: '/employees/PASTE_EMPLOYEE_ID/deactivate', body: '{}', note: 'Soft-deactivates an employee profile.' },

  { phase: 'Phase 3 · Catalogue', title: 'List products', method: 'GET', path: '/products', note: 'Browse product and variant records.' },
  { phase: 'Phase 3 · Catalogue', title: 'Create product', method: 'POST', path: '/products', body: '{\n  "name": "Demo Product",\n  "baseUnit": "packet",\n  "unitsPerCarton": 12,\n  "reorderLevel": 24,\n  "hasVariants": false,\n  "sku": "DEMO-001",\n  "sellingPrice": 100,\n  "purchasePrice": 60,\n  "priceChangeReason": "Initial test product setup"\n}', note: 'Super Admin only. For variants, set hasVariants=true and provide a variants array.' },
  { phase: 'Phase 3 · Catalogue', title: 'Update product prices', method: 'PATCH', path: '/products/PASTE_PRODUCT_ID/prices', body: '{\n  "sellingPrice": 110,\n  "purchasePrice": 65,\n  "reason": "Test price audit history"\n}', note: 'Super Admin only. Changes are recorded in price history.' },
  { phase: 'Phase 3 · Catalogue', title: 'Add product variant', method: 'POST', path: '/products/PASTE_PRODUCT_ID/variants', body: '{\n  "name": "Blue / Medium",\n  "sku": "DEMO-001-BLU-M",\n  "barcode": "100000001",\n  "size": "M",\n  "colour": "Blue"\n}', note: 'Adds a stock-distinct variant to a product.' },
  { phase: 'Phase 3 · Catalogue', title: 'Convert quantities', method: 'POST', path: '/products/PASTE_PRODUCT_ID/convert-quantity', body: '{\n  "cartons": 2,\n  "baseUnits": 3\n}', note: 'Checks carton/base-unit conversion for a product.' },
  { phase: 'Phase 3 · Catalogue', title: 'Price history', method: 'GET', path: '/products/PASTE_PRODUCT_ID/price-history', note: 'Super Admin only; shows audited price changes.' },

  { phase: 'Phase 4 · Inventory', title: 'Stock balances', method: 'GET', path: '/inventory/balances?locationId=PASTE_LOCATION_ID', note: 'Add variantId or stockState query filters as needed.' },
  { phase: 'Phase 4 · Inventory', title: 'Import opening stock', method: 'POST', path: '/inventory/opening-stock/import', body: '{\n  "locationId": "PASTE_LOCATION_ID",\n  "notes": "Opening balance test",\n  "lines": [\n    { "variantId": "PASTE_VARIANT_ID", "quantityBaseUnits": 24 }\n  ]\n}', note: 'Admin, Super Admin, or Central Manager. Uses an idempotency key.' },
  { phase: 'Phase 4 · Inventory', title: 'Supplier receipt', method: 'POST', path: '/receiving/receipts', body: '{\n  "locationId": "PASTE_LOCATION_ID",\n  "receiptNumber": "GRN-TEST-001",\n  "supplierName": "Demo Supplier",\n  "lines": [\n    { "variantId": "PASTE_VARIANT_ID", "cartons": 2, "looseBaseUnits": 3 }\n  ]\n}', note: 'Records cartons and loose base units into available stock.' },

  { phase: 'Phase 5 · Transfers', title: 'List transfers', method: 'GET', path: '/transfers', note: 'Shows transfers available to the signed-in user.' },
  { phase: 'Phase 5 · Transfers', title: 'Create transfer', method: 'POST', path: '/transfers', body: '{\n  "sourceLocationId": "PASTE_SOURCE_ID",\n  "destLocationId": "PASTE_DESTINATION_ID",\n  "lines": [\n    { "variantId": "PASTE_VARIANT_ID", "cartons": 1, "looseBaseUnits": 2 }\n  ],\n  "notes": "Transfer workflow test"\n}', note: 'Creates a draft; submit, approve, dispatch, and receive it by ID.' },
  { phase: 'Phase 5 · Transfers', title: 'Generate replenishment', method: 'POST', path: '/transfers/replenishment/generate', body: '{\n  "destLocationId": "PASTE_DESTINATION_ID"\n}', note: 'Creates suggestions from reorder thresholds; does not move stock.' },
  { phase: 'Phase 5 · Transfers', title: 'List replenishment drafts', method: 'GET', path: '/transfers/replenishment', note: 'Review suggested and approved quantities.' },
  { phase: 'Phase 5 · Transfers', title: 'Approve replenishment', method: 'POST', path: '/transfers/replenishment/PASTE_REQUEST_ID/approve', body: '{\n  "lines": [\n    { "variantId": "PASTE_VARIANT_ID", "approvedQtyBase": 12 }\n  ]\n}', note: 'Creates a transfer draft using manager-approved quantities.' },
  { phase: 'Phase 5 · Transfers', title: 'Reject replenishment', method: 'POST', path: '/transfers/replenishment/PASTE_REQUEST_ID/reject', body: '{\n  "reason": "Replenishment not required for this test"\n}', note: 'Records a reason and rejects the replenishment request.' },
  { phase: 'Phase 5 · Transfers', title: 'Submit transfer', method: 'POST', path: '/transfers/PASTE_TRANSFER_ID/submit', body: '{}', note: 'Moves a draft into its approval flow.' },
  { phase: 'Phase 5 · Transfers', title: 'Transfer details', method: 'GET', path: '/transfers/PASTE_TRANSFER_ID', note: 'Inspect transfer status, quantities, and discrepancy records.' },
  { phase: 'Phase 5 · Transfers', title: 'Approve transfer', method: 'POST', path: '/transfers/PASTE_TRANSFER_ID/approve', body: '{\n  "lines": [\n    { "variantId": "PASTE_VARIANT_ID", "approvedQtyBase": 12 }\n  ]\n}', note: 'Approves quantities before dispatch.' },
  { phase: 'Phase 5 · Transfers', title: 'Reject transfer', method: 'POST', path: '/transfers/PASTE_TRANSFER_ID/reject', body: '{\n  "reason": "Reject this test transfer"\n}', note: 'Records a rejection reason.' },
  { phase: 'Phase 5 · Transfers', title: 'Dispatch transfer', method: 'POST', path: '/transfers/PASTE_TRANSFER_ID/dispatch', body: '{\n  "lines": [\n    { "variantId": "PASTE_VARIANT_ID", "cartons": 1, "looseBaseUnits": 0 }\n  ]\n}', note: 'Moves stock into transit.' },
  { phase: 'Phase 5 · Transfers', title: 'Receive transfer', method: 'POST', path: '/transfers/PASTE_TRANSFER_ID/receive', body: '{\n  "lines": [\n    { "variantId": "PASTE_VARIANT_ID", "receivedQtyBase": 12, "finalizeLine": true }\n  ]\n}', note: 'Confirms receipt and supports damaged/short discrepancy fields.' },
  { phase: 'Phase 5 · Transfers', title: 'Cancel transfer', method: 'PATCH', path: '/transfers/PASTE_TRANSFER_ID/cancel', body: '{\n  "reason": "Cancel test transfer"\n}', note: 'Uses a reversal when stock has already moved.' },

  { phase: 'Phase 6 · POS', title: 'Quote a sale', method: 'POST', path: '/sales/quote', body: '{\n  "lines": [\n    { "variantId": "PASTE_VARIANT_ID", "quantity": 1, "enteredUnit": "BASE_UNIT" }\n  ]\n}', note: 'Prefer the cashier terminal for the complete checkout journey.' },
  { phase: 'Phase 6 · POS', title: 'Find invoice', method: 'GET', path: '/sales/invoice/PASTE_INVOICE_NUMBER', note: 'Permission-aware invoice lookup.' },
];

type HistoryEntry = { method: string; path: string; status: number | string; duration: number; at: string };

function randomKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export default function OperationsPage() {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('admin@premiumretail.com');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [selected, setSelected] = useState(1);
  const [method, setMethod] = useState<RequestPreset['method']>('GET');
  const [path, setPath] = useState('/health/readiness');
  const [body, setBody] = useState('');
  const [useAuth, setUseAuth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState('');
  const [responseMeta, setResponseMeta] = useState<{ status: number | string; duration: number } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const groups = useMemo(() => [...new Set(presets.map((preset) => preset.phase))], []);

  useEffect(() => {
    const savedToken = sessionStorage.getItem('pos-operations-token') || '';
    const savedRole = sessionStorage.getItem('pos-operations-role') || '';
    setToken(savedToken);
    setRole(savedRole);
    const savedHistory = sessionStorage.getItem('pos-operations-history');
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory) as HistoryEntry[]); } catch { sessionStorage.removeItem('pos-operations-history'); }
    }
  }, []);

  function choosePreset(index: number) {
    const preset = presets[index];
    setSelected(index);
    setMethod(preset.method);
    setPath(preset.path);
    setBody(preset.body || '');
    setUseAuth(preset.auth !== false);
    setError('');
    setResponse('');
    setResponseMeta(null);
  }

  async function parseMessage(result: Response) {
    const text = await result.text();
    if (!text) return '';
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const content = await result.json();
      if (!result.ok) throw new Error(content.message || `Sign in failed (${result.status})`);
      const accessToken = content.data.accessToken as string;
      const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const activeRole = String(payload.role || 'Authenticated user');
      setToken(accessToken);
      setRole(activeRole);
      sessionStorage.setItem('pos-operations-token', accessToken);
      sessionStorage.setItem('pos-operations-role', activeRole);
      setPassword('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in');
    } finally { setLoading(false); }
  }

  function signOut() {
    setToken(''); setRole(''); setPassword('');
    sessionStorage.removeItem('pos-operations-token');
    sessionStorage.removeItem('pos-operations-role');
  }

  async function sendRequest(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true); setError(''); setResponse(''); setResponseMeta(null);
    const started = performance.now();
    const requestPath = path.startsWith('/') ? path : `/${path}`;
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (useAuth && token) headers.Authorization = `Bearer ${token}`;
      const isMutation = method !== 'GET';
      if (isMutation) headers['Idempotency-Key'] = randomKey();
      if (isMutation && body.trim()) headers['Content-Type'] = 'application/json';
      let parsedBody: unknown;
      if (isMutation && body.trim()) parsedBody = JSON.parse(body);
      const result = await fetch(`${API_BASE}${requestPath}`, {
        method,
        headers,
        ...(isMutation && body.trim() ? { body: JSON.stringify(parsedBody) } : {}),
        cache: 'no-store',
      });
      const responseText = await parseMessage(result);
      const duration = Math.round(performance.now() - started);
      setResponse(responseText || '(empty response)');
      setResponseMeta({ status: result.status, duration });
      const nextHistory = [{ method, path: requestPath, status: result.status, duration, at: new Date().toLocaleTimeString() }, ...history].slice(0, 12);
      setHistory(nextHistory);
      sessionStorage.setItem('pos-operations-history', JSON.stringify(nextHistory));
    } catch (caught) {
      const duration = Math.round(performance.now() - started);
      const message = caught instanceof SyntaxError ? 'Request body is not valid JSON.' : caught instanceof Error ? caught.message : 'Request failed';
      setError(message);
      setResponseMeta({ status: 'ERR', duration });
    } finally { setLoading(false); }
  }

  return (
    <main className="ops-shell">
      <header className="ops-topbar">
        <a className="ops-brand" href="/"><span className="brand-mark small">P</span><span><strong>Premium Retail</strong><small>OPERATIONS TEST BENCH</small></span></a>
        <nav className="ops-topnav"><a href="/dashboard">Demo dashboard</a><a href="/">Cashier terminal</a><a href="/admin/discount-limits">Discount limits</a><a href="/admin/sales-permissions">Sale permissions</a><a href="/sales-controls">Returns & cancellations</a></nav>
        {token ? <div className="ops-session"><span className="ops-session-dot" />{role}<button onClick={signOut}>Sign out</button></div> : <span className="ops-session muted-session">Sign in to make authenticated requests</span>}
      </header>

      <div className="ops-content">
        <section className="ops-intro">
          <div><div className="eyebrow">PHASES 1–6 · IMPLEMENTED API WORKFLOWS</div><h1>Operations test bench</h1><p>Run real API requests against your local database. Pick a workflow, review its sample payload, replace the placeholder IDs, and inspect the server response.</p></div>
          <div className="ops-api-chip"><span className="ops-session-dot" /> API <code>{API_BASE}</code></div>
        </section>

        <section className="ops-login-card">
          {token ? <><div><span className="ops-label">SESSION ACTIVE</span><strong>{email}</strong><small>{role} · Token stored in this browser tab</small></div><p>Requests include your access token. The API still enforces role and location permissions.</p></> : <form onSubmit={signIn} className="ops-login-form"><div><span className="ops-label">AUTHENTICATE REQUESTS</span><strong>Sign in with an existing account</strong><small>Use a Super Admin account to access all admin test routes.</small></div><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="ops-primary" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>{error && <span className="ops-error">{error}</span>}</form>}
        </section>

        <div className="ops-workspace">
          <aside className="ops-presets">
            <div className="ops-presets-heading"><span className="ops-label">WORKFLOW REQUESTS</span><small>{presets.length} templates</small></div>
            {groups.map((group) => <div className="ops-group" key={group}><h2>{group}</h2>{presets.map((preset, index) => preset.phase === group && <button key={preset.title} className={`ops-preset ${selected === index ? 'active' : ''}`} onClick={() => choosePreset(index)}><span className={`ops-method ${preset.method.toLowerCase()}`}>{preset.method}</span><span>{preset.title}</span></button>)}</div>)}
          </aside>

          <section className="ops-main">
            <form className="ops-request-card" onSubmit={sendRequest}>
              <div className="ops-card-heading"><div><span className="ops-label">REQUEST BUILDER</span><h2>{presets[selected].title}</h2><p>{presets[selected].note}</p></div><span className="ops-phase-pill">{presets[selected].phase}</span></div>
              <div className="ops-request-line"><select aria-label="HTTP method" value={method} onChange={(event) => setMethod(event.target.value as RequestPreset['method'])}><option>GET</option><option>POST</option><option>PATCH</option></select><input aria-label="API path" value={path} onChange={(event) => setPath(event.target.value)} spellCheck={false} /><button className="ops-primary" type="submit" disabled={loading}>{loading ? 'Sending…' : 'Send request'}</button></div>
              {method !== 'GET' && <label className="ops-json-label">JSON request body<textarea spellCheck={false} value={body} onChange={(event) => setBody(event.target.value)} placeholder="{}" /></label>}
              <div className="ops-request-options"><label><input type="checkbox" checked={useAuth} onChange={(event) => setUseAuth(event.target.checked)} /> Include access token</label><span>{method !== 'GET' ? 'An idempotency key is added automatically.' : 'Read-only request.'}</span></div>
              {error && <div className="ops-error-box">{error}</div>}
            </form>

            <section className="ops-response-card"><div className="ops-response-heading"><div><span className="ops-label">SERVER RESPONSE</span><h2>{responseMeta ? `${responseMeta.status} · ${responseMeta.duration} ms` : 'Response will appear here'}</h2></div>{response && <button className="ops-copy" onClick={() => void navigator.clipboard.writeText(response)}>Copy JSON</button>}</div><pre>{response || 'Choose a request on the left and send it to inspect the result.'}</pre></section>

            <section className="ops-history-card"><div className="ops-response-heading"><div><span className="ops-label">THIS TAB</span><h2>Recent requests</h2></div><button className="ops-copy" onClick={() => { setHistory([]); sessionStorage.removeItem('pos-operations-history'); }}>Clear history</button></div>{history.length ? <div className="ops-history-list">{history.map((entry, index) => <button key={`${entry.at}-${index}`} onClick={() => { setMethod(entry.method as RequestPreset['method']); setPath(entry.path); setBody(''); setUseAuth(true); }}><span className={`ops-method ${entry.method.toLowerCase()}`}>{entry.method}</span><code>{entry.path}</code><b className={typeof entry.status === 'number' && entry.status < 400 ? 'good' : 'bad'}>{entry.status}</b><small>{entry.at}</small></button>)}</div> : <p className="ops-empty">Requests you send will be listed here.</p>}</section>
          </section>
        </div>
        <p className="ops-footnote">This bench sends requests to the running API and may create or change database records. Use a local development database and sample data while exploring.</p>
      </div>
    </main>
  );
}
