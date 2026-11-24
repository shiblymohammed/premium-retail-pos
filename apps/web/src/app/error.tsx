'use client';

import { TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected errors
    console.error('Unhandled route error caught by error boundary:', error);
  }, [error]);

  return (
    <div
      style={{
        padding: '60px 24px',
        maxWidth: '560px',
        margin: '80px auto',
        background: 'var(--retail-card)',
        borderRadius: '16px',
        border: '1px solid light-dark(#fee2e2, #542a2a)',
        boxShadow: '0 8px 30px rgba(220, 38, 38, 0.08)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '54px',
          height: '54px',
          borderRadius: '50%',
          background: 'light-dark(#fef2f2, #331d1d)',
          color: 'light-dark(#dc2626, #f2abab)',
          fontSize: '26px',
          display: 'grid',
          placeItems: 'center',
          margin: '0 auto 16px',
        }}
      >
        <TriangleAlert size="1em" className="inline-icon" aria-hidden="true" />
      </div>

      <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--retail-ink)', margin: '0 0 8px' }}>
        Operational View Unavailable
      </h2>
      <p style={{ color: 'var(--retail-muted)', fontSize: '13px', lineHeight: 1.5, margin: '0 0 24px' }}>
        An unexpected error occurred while loading this workspace view ({error.message || 'Unknown network error'}).
      </p>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            background: 'var(--retail-accent)',
            color: '#ffffff',
            border: 'none',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Try Again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            background: 'var(--retail-edge)',
            color: 'var(--retail-ink)',
            border: '1px solid light-dark(#cbd5e1, #34455a)',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}
