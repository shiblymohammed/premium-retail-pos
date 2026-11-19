'use client';

import React from 'react';
import { SettingsTab } from './types';

export interface SettingsTabsProps {
  activeTab: SettingsTab;
  setActiveTab: (tab: SettingsTab) => void;
  roleTabLabel: string;
}

export const SettingsTabs: React.FC<SettingsTabsProps> = ({
  activeTab,
  setActiveTab,
  roleTabLabel,
}) => {
  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'general', label: '⚙ Workstation & General' },
    { id: 'role-ops', label: `🎯 ${roleTabLabel}` },
    { id: 'security', label: '🔒 Security & PIN' },
    { id: 'notifications', label: '🔔 Alerts & Notifications' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: '6px',
        borderBottom: '1px solid #e2e8f0',
        marginBottom: '24px',
        overflowX: 'auto',
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              borderBottom: isActive ? '3px solid #155eef' : '3px solid transparent',
              color: isActive ? '#155eef' : '#64748b',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default SettingsTabs;
