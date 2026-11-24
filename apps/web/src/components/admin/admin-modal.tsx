'use client';

import { X, Zap } from 'lucide-react';
import React, { useEffect, useId } from 'react';

export interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  badgeIcon?: React.ReactNode;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  title,
  badgeIcon = <Zap size={22} aria-hidden="true" />,
  subtitle,
  maxWidth = '560px',
  children,
  footer,
}) => {
  const titleId = useId();
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        display: 'grid',
        placeItems: 'center',
        padding: '24px 16px',
        zIndex: 500,
      }}
      onClick={onClose}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby={titleId}
        style={{
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          background: 'var(--retail-card)',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.22)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--retail-edge-strong)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--retail-edge)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--retail-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'light-dark(#eff6ff, #1d2733)',
                color: 'var(--retail-accent)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '18px',
                fontWeight: 800,
              }}
            >
              {badgeIcon}
            </div>
            <div>
              <h3 id={titleId} style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: 'var(--retail-ink)' }}>{title}</h3>
              {subtitle && (
                <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: 'var(--retail-muted)' }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--retail-raised)',
              color: 'var(--retail-muted)',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <X size="1em" className="inline-icon" aria-hidden="true" />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              padding: '16px 24px',
              background: 'var(--retail-raised)',
              borderTop: '1px solid var(--retail-edge)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminModal;
