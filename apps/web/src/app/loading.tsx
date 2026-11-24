export default function GlobalLoading() {
  return (
    <div
      style={{
        padding: '36px',
        maxWidth: '1440px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Skeleton Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'var(--retail-edge-strong)',
            animation: 'pulse 1.5s infinite ease-in-out',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              width: '220px',
              height: '24px',
              borderRadius: '6px',
              background: 'var(--retail-edge-strong)',
              animation: 'pulse 1.5s infinite ease-in-out',
            }}
          />
          <div
            style={{
              width: '340px',
              height: '14px',
              borderRadius: '4px',
              background: 'var(--retail-edge)',
              animation: 'pulse 1.5s infinite ease-in-out',
            }}
          />
        </div>
      </div>

      {/* Skeleton Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '16px',
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: '110px',
              borderRadius: '12px',
              background: 'var(--retail-card)',
              border: '1px solid var(--retail-edge-strong)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ width: '40%', height: '12px', background: 'var(--retail-edge)', borderRadius: '4px' }} />
            <div style={{ width: '70%', height: '18px', background: 'var(--retail-edge-strong)', borderRadius: '4px' }} />
            <div style={{ width: '50%', height: '12px', background: 'var(--retail-raised)', borderRadius: '4px' }} />
          </div>
        ))}
      </div>

      {/* Skeleton Content Area */}
      <div
        style={{
          height: '340px',
          borderRadius: '14px',
          background: 'var(--retail-card)',
          border: '1px solid var(--retail-edge)',
          padding: '24px',
        }}
      >
        <div style={{ width: '30%', height: '16px', background: 'var(--retail-edge)', borderRadius: '4px', marginBottom: '20px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} style={{ width: '100%', height: '36px', background: 'var(--retail-raised)', borderRadius: '6px' }} />
          ))}
        </div>
      </div>
    </div>
  );
}
