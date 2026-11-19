'use client';

import React from 'react';

export interface AvatarBubble {
  text: string;
  bg?: string;
}

export interface QuickAccessCardProps {
  isActive?: boolean;
  onClick?: () => void;
  title?: string;
  tabLabel?: string;
  avatars?: AvatarBubble[];
  groupLabel?: string;
  heading: React.ReactNode;
  subheading?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  children?: React.ReactNode;
}

export const QuickAccessCard: React.FC<QuickAccessCardProps> = ({
  isActive = false,
  onClick,
  title,
  tabLabel = 'SHARED WITH',
  avatars,
  groupLabel = 'ROLE GROUP',
  heading,
  subheading,
  style,
  className = '',
  children,
}) => {
  return (
    <div
      className={`drive-folder-card${isActive ? ' active-folder' : ''} ${className}`}
      onClick={onClick}
      title={title}
      style={{ cursor: onClick ? 'pointer' : 'default', ...style }}
    >
      {children ? (
        children
      ) : (
        <>
          <div className="drive-folder-tab">
            <span className="drive-tab-label">{tabLabel}</span>
            {avatars && avatars.length > 0 && (
              <div className="drive-avatar-stack">
                {avatars.map((av, idx) => (
                  <span
                    key={idx}
                    className="drive-avatar-bubble"
                    style={{ background: av.bg || '#2563eb' }}
                  >
                    {av.text}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="drive-folder-body">
            {groupLabel && <small>{groupLabel}</small>}
            <strong>{heading}</strong>
            {subheading && (
              <span style={{ fontSize: '11.5px', opacity: 0.82, marginTop: '3px', display: 'block' }}>
                {subheading}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default QuickAccessCard;
