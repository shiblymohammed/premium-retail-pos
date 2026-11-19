'use client';

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
        background: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #fee2e2',
        boxShadow: '0 8px 30px rgba(220, 38, 38, 0.08)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '54px',
          height: '54px',
          borderRadius: '50%',
          background: '#fef2f2',
          color: '#dc2626',
          fontSize: '26px',
          display: 'grid',
          placeItems: 'center',
          margin: '0 auto 16px',
        }}
      >
        ⚠️
      </div>

      <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
        Operational View Unavailable
      </h2>
      <p style={{ color: '#64748b', fontSize: '13px', lineHeight: 1.5, margin: '0 0 24px' }}>
        An unexpected error occurred while loading this workspace view ({error.message || 'Unknown network error'}).
      </p>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            background: '#1a62ea',
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
            background: '#f1f5f9',
            color: '#334155',
            border: '1px solid #cbd5e1',
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
