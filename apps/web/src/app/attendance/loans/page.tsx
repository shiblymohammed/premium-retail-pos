'use client';

export default function LoansAdvancesPage() {
  return (
    <main className="app-page" style={{ maxWidth: 1100, margin: '0 auto', padding: 32, color: 'var(--retail-ink)' }}>
      <section style={{ background: 'var(--retail-card)', border: '1px solid var(--retail-edge-strong)', borderRadius: 12, padding: 24 }}>
        <p style={{ margin: 0, color: 'var(--retail-accent)', fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>Workforce
        </p>
        <h1 style={{ margin: '8px 0', fontSize: 26 }}>Loans &amp; advances</h1>
        <p style={{ margin: 0, color: 'var(--retail-muted)', lineHeight: 1.6 }}>This feature is deferred and is not enabled for the beta. No loan records or payroll actions are available here.</p>
      </section>
    </main>
  );
}
