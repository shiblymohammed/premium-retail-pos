export default function Home() {
  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '16px',
        padding: '3rem',
        maxWidth: '600px',
        width: '100%',
      }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: 700,
          marginBottom: '0.5rem',
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          Premium Retail POS
        </h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
          Multi-location retail management system
        </p>

        <div style={{
          display: 'grid',
          gap: '0.75rem',
          textAlign: 'left',
        }}>
          <StatusItem label="API Server" endpoint="/api/v1/health/liveness" />
          <StatusItem label="Database" endpoint="/api/v1/health/readiness" />
          <StatusItem label="Authentication" endpoint="/api/v1/auth/login" />
        </div>

        <p style={{
          marginTop: '2rem',
          fontSize: '0.875rem',
          color: 'var(--color-text-muted)',
        }}>
          Phase 1 — Foundation & Authentication Bootstrap
        </p>
      </div>
    </main>
  );
}

function StatusItem({ label, endpoint }: { label: string; endpoint: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.75rem 1rem',
      background: 'var(--color-surface-raised)',
      borderRadius: '8px',
      fontSize: '0.875rem',
    }}>
      <span>{label}</span>
      <code style={{
        color: 'var(--color-text-muted)',
        fontSize: '0.75rem',
      }}>{endpoint}</code>
    </div>
  );
}
