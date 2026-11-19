'use client';

import React, { useEffect } from 'react';

export interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  badgeIcon?: string;
  subtitle?: string;
  maxWidth?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  title,
  badgeIcon = '⚡',
  subtitle,
  maxWidth = '560px',
  children,
  footer,
}) => {
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
        style={{
          width: '100%',
          maxWidth,
          maxHeight: '90vh',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.22)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#eff6ff',
                color: '#1a62ea',
                display: 'grid',
                placeItems: 'center',
                fontSize: '18px',
                fontWeight: 800,
              }}
            >
              {badgeIcon}
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: '#0f172a' }}>{title}</h3>
              {subtitle && (
                <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#64748b' }}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              background: '#f8fafc',
              color: '#64748b',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            ✕
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
              background: '#f8fafc',
              borderTop: '1px solid #eef2f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
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
