'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import React from 'react';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDropdownConfig {
  id: string;
  label: string;
  currentValue: string;
  displayValue?: string;
  options: FilterOption[];
  onSelect: (value: string) => void;
}

export interface AdminToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterDropdownConfig[];
  openDropdownId?: string | null;
  onToggleDropdown?: (id: string | null) => void;
  activeFilterCount?: number;
  onResetFilters?: () => void;
  extraActions?: React.ReactNode;
}

export const AdminToolbar: React.FC<AdminToolbarProps> = ({
  search,
  onSearchChange,
  searchPlaceholder = 'Search records...',
  filters = [],
  openDropdownId = null,
  onToggleDropdown,
  activeFilterCount = 0,
  onResetFilters,
  extraActions,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '320px', flexWrap: 'wrap' }}>
        {/* Search input pill */}
        <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
          <span
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '13px',
              color: '#94a3b8',
            }}
          >
            <Search size="1em" className="inline-icon" aria-hidden="true" />
          </span>
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 14px 7px 32px',
              borderRadius: '18px',
              border: '1px solid light-dark(#cbd5e1, #34455a)',
              fontSize: '12px',
              color: 'var(--retail-ink)',
              background: 'var(--retail-card)',
              outline: 'none',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
          />
        </div>

        {/* Dropdown filters */}
        {filters.map((filter) => {
          const isOpen = openDropdownId === filter.id;
          const isFiltered = filter.currentValue !== 'ALL';
          const currentOption = filter.options.find((o) => o.value === filter.currentValue);
          const buttonLabel = filter.displayValue || (isFiltered ? currentOption?.label : filter.label);

          return (
            <div key={filter.id} className="custom-filter-dropdown-wrap" style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDropdown?.(isOpen ? null : filter.id);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: isFiltered ? '1px solid var(--retail-accent-line)' : '1px solid var(--retail-edge-strong)',
                  background: isFiltered ? 'var(--retail-accent-soft)' : 'var(--retail-card)',
                  color: isFiltered ? 'var(--retail-accent)' : 'var(--retail-muted)',
                  fontSize: '12px',
                  fontWeight: isFiltered ? 750 : 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                }}
              >
                <span>{buttonLabel}</span>
                <span style={{ fontSize: '8px', color: isFiltered ? 'var(--retail-accent)' : '#94a3b8' }}><ChevronDown size="1em" className="inline-icon" aria-hidden="true" /></span>
              </button>

              {isOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    minWidth: '200px',
                    background: 'var(--retail-card)',
                    borderRadius: '12px',
                    border: '1px solid var(--retail-edge-strong)',
                    boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
                    padding: '6px',
                    zIndex: 100,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {filter.options.map((opt) => {
                    const isSelected = filter.currentValue === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          filter.onSelect(opt.value);
                          onToggleDropdown?.(null);
                        }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '7px',
                          border: 'none',
                          background: isSelected ? 'var(--retail-accent-soft)' : 'transparent',
                          color: isSelected ? 'var(--retail-accent)' : 'var(--retail-ink)',
                          fontSize: '12px',
                          fontWeight: isSelected ? 700 : 500,
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'var(--retail-raised)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span>{opt.label}</span>
                        {isSelected && <span style={{ color: 'var(--retail-accent)', fontWeight: 800 }}><Check size="1em" className="inline-icon" aria-hidden="true" /></span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Reset Filters button */}
        {(activeFilterCount > 0 || search.trim() !== '') && onResetFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--retail-accent)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              padding: '4px 6px',
              textDecoration: 'underline',
            }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {extraActions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {extraActions}
        </div>
      )}
    </div>
  );
};

export default AdminToolbar;
