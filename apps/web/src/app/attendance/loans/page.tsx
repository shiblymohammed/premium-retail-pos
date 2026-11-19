'use client';

import { FormEvent, useMemo, useState } from 'react';
import { getStoredSession } from '@/lib/auth';

export interface AdvanceRecord {
  id: string;
  code: string;
  employeeName: string;
  employeeCode: string;
  storeLocation: string;
  disbursedDate: string;
  principalAmount: number;
  monthlyDeduction: number;
  totalRepaid: number;
  remainingBalance: number;
  tenureMonths: number;
  installmentsPaid: number;
  status: 'ACTIVE' | 'PAID_OFF' | 'PENDING_APPROVAL' | 'REJECTED';
  nextDeductionDate: string;
  reason: string;
}

const INITIAL_ADVANCES: AdvanceRecord[] = [
  {
    id: 'adv-001',
    code: 'ADV-2026-081',
    employeeName: 'Ravi Menon',
    employeeCode: 'EMP-CSH-0842',
    storeLocation: 'Downtown Store',
    disbursedDate: '01-Nov-2026',
    principalAmount: 18000,
    monthlyDeduction: 6000,
    totalRepaid: 6000,
    remainingBalance: 12000,
    tenureMonths: 3,
    installmentsPaid: 1,
    status: 'ACTIVE',
    nextDeductionDate: '30-Nov-2026',
    reason: 'Emergency Medical Treatment',
  },
  {
    id: 'adv-002',
    code: 'ADV-2026-079',
    employeeName: 'Priya Sharma',
    employeeCode: 'EMP-STF-0109',
    storeLocation: 'Downtown Store',
    disbursedDate: '01-Oct-2026',
    principalAmount: 12000,
    monthlyDeduction: 6000,
    totalRepaid: 12000,
    remainingBalance: 0,
    tenureMonths: 2,
    installmentsPaid: 2,
    status: 'PAID_OFF',
    nextDeductionDate: '—',
    reason: 'Educational Tuition Fees',
  },
  {
    id: 'adv-003',
    code: 'ADV-2026-084',
    employeeName: 'Maya Das',
    employeeCode: 'EMP-CSH-0844',
    storeLocation: 'West End Outlet',
    disbursedDate: '15-Nov-2026',
    principalAmount: 20000,
    monthlyDeduction: 5000,
    totalRepaid: 0,
    remainingBalance: 20000,
    tenureMonths: 4,
    installmentsPaid: 0,
    status: 'PENDING_APPROVAL',
    nextDeductionDate: '30-Nov-2026',
    reason: 'Family Home Relocation',
  },
  {
    id: 'adv-004',
    code: 'ADV-2026-076',
    employeeName: 'Neel Shah',
    employeeCode: 'EMP-CSH-0843',
    storeLocation: 'Downtown Store',
    disbursedDate: '01-Aug-2026',
    principalAmount: 15000,
    monthlyDeduction: 5000,
    totalRepaid: 15000,
    remainingBalance: 0,
    tenureMonths: 3,
    installmentsPaid: 3,
    status: 'PAID_OFF',
    nextDeductionDate: '—',
    reason: 'Vehicle Repair',
  },
];

export default function LoansAdvancesPage() {
  const [advances, setAdvances] = useState<AdvanceRecord[]>(INITIAL_ADVANCES);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [notice, setNotice] = useState('');

  // Request Advance Modal
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [monthlySalary] = useState(42000); // Base reference salary
  const [requestAmount, setRequestAmount] = useState('15000');
  const [requestReason, setRequestReason] = useState('Emergency Medical Expenses');
  const [requestTenure, setRequestTenure] = useState('3');
  const [agreedTerms, setAgreedTerms] = useState(false);

  // Installments Detail Drawer
  const [selectedAdvance, setSelectedAdvance] = useState<AdvanceRecord | null>(null);

  const maxAllowedAdvance = Math.floor(monthlySalary * 0.5); // 50% max cap

  const kpis = useMemo(() => {
    const totalDisbursed = advances.reduce((sum, a) => sum + (a.status !== 'REJECTED' && a.status !== 'PENDING_APPROVAL' ? a.principalAmount : 0), 0);
    const totalRepaid = advances.reduce((sum, a) => sum + a.totalRepaid, 0);
    const outstanding = advances.reduce((sum, a) => sum + (a.status === 'ACTIVE' ? a.remainingBalance : 0), 0);
    const pendingCount = advances.filter((a) => a.status === 'PENDING_APPROVAL').length;
    return { totalDisbursed, totalRepaid, outstanding, pendingCount };
  }, [advances]);

  const filteredAdvances = useMemo(() => {
    return advances.filter((a) => {
      const matchSearch =
        !search.trim() ||
        a.code.toLowerCase().includes(search.toLowerCase()) ||
        a.employeeName.toLowerCase().includes(search.toLowerCase()) ||
        a.employeeCode.toLowerCase().includes(search.toLowerCase()) ||
        a.reason.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || a.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [advances, search, statusFilter]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

  const calculatedMonthlyDeduction = useMemo(() => {
    const amt = Number(requestAmount) || 0;
    const ten = Number(requestTenure) || 1;
    return Math.ceil(amt / ten);
  }, [requestAmount, requestTenure]);

  const handleRequestSubmit = (e: FormEvent) => {
    e.preventDefault();
    const amt = Number(requestAmount) || 0;
    if (amt <= 0) {
      alert('Advance amount must be greater than 0.');
      return;
    }
    if (amt > maxAllowedAdvance) {
      alert(`Advance exceeds max allowable cap of ${formatCurrency(maxAllowedAdvance)} (50% of monthly net salary).`);
      return;
    }
    if (!agreedTerms) {
      alert('You must acknowledge payroll deduction terms.');
      return;
    }

    const session = getStoredSession();
    const employeeName = session?.user?.name || 'Staff Employee';
    const employeeEmail = session?.user?.email || 'staff@premiumretail.com';

    const newAdv: AdvanceRecord = {
      id: `adv-${Date.now()}`,
      code: `ADV-2026-${Math.floor(100 + Math.random() * 900)}`,
      employeeName,
      employeeCode: 'EMP-REQ-099',
      storeLocation: 'Downtown Store',
      disbursedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      principalAmount: amt,
      monthlyDeduction: calculatedMonthlyDeduction,
      totalRepaid: 0,
      remainingBalance: amt,
      tenureMonths: Number(requestTenure),
      installmentsPaid: 0,
      status: 'PENDING_APPROVAL',
      nextDeductionDate: '30-Nov-2026',
      reason: requestReason,
    };

    setAdvances((prev) => [newAdv, ...prev]);
    setIsRequestModalOpen(false);
    setNotice(`Advance application ${newAdv.code} for ${formatCurrency(amt)} submitted for supervisor approval.`);
  };

  const handleApproveAdvance = (id: string) => {
    setAdvances((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: 'ACTIVE' } : a
      )
    );
    setNotice('Salary advance approved and scheduled for payroll deduction disbursement.');
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1440px', margin: '0 auto', color: '#0f172a' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#155eef', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Workforce & Payroll Self-Service
          </span>
          <h1 style={{ fontSize: '26px', fontWeight: 800, margin: '4px 0 6px', color: '#0f172a' }}>
            Employee Loans & Advances Summary
          </h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
            Disbursed salary advances, scheduled payroll deductions, repayment history, and advance application desk.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setIsRequestModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '8px',
              background: '#155eef',
              color: '#ffffff',
              border: 'none',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(21, 94, 239, 0.25)',
            }}
          >
            <span>+</span> Apply for Salary Advance
          </button>
        </div>
      </div>

      {notice && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            fontSize: '13px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>✓ {notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            style={{ background: 'none', border: 'none', color: '#065f46', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <small style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em' }}>TOTAL ADVANCES DISBURSED</small>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
            {formatCurrency(kpis.totalDisbursed)}
          </div>
          <span style={{ fontSize: '11px', color: '#155eef', fontWeight: 600 }}>Approved loan principal</span>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <small style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em' }}>TOTAL REPAID VIA PAYROLL</small>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>
            {formatCurrency(kpis.totalRepaid)}
          </div>
          <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>Recovered through salary cycle</span>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <small style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em' }}>OUTSTANDING BALANCE</small>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#d97706', marginTop: '4px' }}>
            {formatCurrency(kpis.outstanding)}
          </div>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Scheduled for upcoming deductions</span>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <small style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em' }}>PENDING SUPERVISOR REVIEW</small>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#7c3aed', marginTop: '4px' }}>
            {kpis.pendingCount} Applications
          </div>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Awaiting store manager sign-off</span>
        </div>
      </div>

      {/* Search & Filter */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '14px',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <div style={{ flex: '1 1 280px' }}>
          <input
            type="text"
            placeholder="Search by advance ID, employee name, employee code, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#fff',
              fontSize: '13px',
              color: '#334155',
            }}
          >
            <option value="ALL">All Advance Statuses</option>
            <option value="ACTIVE">Active Deductions</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="PAID_OFF">Fully Paid Off</option>
          </select>

          {(search || statusFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('ALL');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Advances Table */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em' }}>
                <th style={{ padding: '14px 20px' }}>REF CODE</th>
                <th style={{ padding: '14px 16px' }}>EMPLOYEE</th>
                <th style={{ padding: '14px 16px' }}>PURPOSE</th>
                <th style={{ padding: '14px 16px' }}>PRINCIPAL</th>
                <th style={{ padding: '14px 16px' }}>MONTHLY DEDUCTION</th>
                <th style={{ padding: '14px 16px' }}>REPAYMENT PROGRESS</th>
                <th style={{ padding: '14px 16px' }}>STATUS</th>
                <th style={{ padding: '14px 20px', textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdvances.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
                    No salary advance records match the active criteria.
                  </td>
                </tr>
              ) : (
                filteredAdvances.map((adv) => {
                  const percentPaid = Math.round((adv.totalRepaid / adv.principalAmount) * 100);
                  const isPending = adv.status === 'PENDING_APPROVAL';
                  const isPaid = adv.status === 'PAID_OFF';

                  return (
                    <tr key={adv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px 20px' }}>
                        <strong style={{ fontFamily: 'monospace', color: '#155eef', fontSize: '13px' }}>
                          {adv.code}
                        </strong>
                        <div style={{ color: '#94a3b8', fontSize: '11.5px', marginTop: '2px' }}>
                          {adv.disbursedDate}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <strong style={{ color: '#0f172a', display: 'block', fontSize: '13.5px' }}>{adv.employeeName}</strong>
                        <span style={{ color: '#64748b', fontSize: '12px' }}>{adv.employeeCode} • {adv.storeLocation}</span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ color: '#334155', fontSize: '13px' }}>{adv.reason}</span>
                        <div style={{ color: '#94a3b8', fontSize: '11.5px', marginTop: '2px' }}>
                          Tenure: {adv.tenureMonths} Months ({adv.installmentsPaid} paid)
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <strong style={{ color: '#0f172a', fontSize: '13.5px' }}>{formatCurrency(adv.principalAmount)}</strong>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <strong style={{ color: '#b45309', fontSize: '13.5px' }}>{formatCurrency(adv.monthlyDeduction)}</strong>
                        <div style={{ color: '#64748b', fontSize: '11.5px', marginTop: '2px' }}>
                          Next: {adv.nextDeductionDate}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', minWidth: '160px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748b', marginBottom: '4px' }}>
                          <span>{formatCurrency(adv.totalRepaid)}</span>
                          <span style={{ fontWeight: 700 }}>{percentPaid}%</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${percentPaid}%`,
                              height: '100%',
                              background: isPaid ? '#16a34a' : '#155eef',
                              borderRadius: '3px',
                            }}
                          ></div>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '3px' }}>
                          Balance: {formatCurrency(adv.remainingBalance)}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {adv.status === 'ACTIVE' && (
                          <span style={{ padding: '3px 8px', borderRadius: '10px', background: '#eff6ff', color: '#1d4ed8', fontSize: '11px', fontWeight: 700, border: '1px solid #bfdbfe' }}>
                            ACTIVE REPAYMENT
                          </span>
                        )}
                        {adv.status === 'PAID_OFF' && (
                          <span style={{ padding: '3px 8px', borderRadius: '10px', background: '#ecfdf5', color: '#047857', fontSize: '11px', fontWeight: 700, border: '1px solid #a7f3d0' }}>
                            PAID OFF
                          </span>
                        )}
                        {adv.status === 'PENDING_APPROVAL' && (
                          <span style={{ padding: '3px 8px', borderRadius: '10px', background: '#fef3c7', color: '#b45309', fontSize: '11px', fontWeight: 700, border: '1px solid #fde68a' }}>
                            PENDING APPROVAL
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          {isPending && (
                            <button
                              type="button"
                              onClick={() => handleApproveAdvance(adv.id)}
                              style={{
                                padding: '5px 10px',
                                borderRadius: '6px',
                                border: 'none',
                                background: '#16a34a',
                                color: '#ffffff',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Approve
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedAdvance(adv)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              color: '#334155',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Schedule
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* REQUEST ADVANCE MODAL */}
      {isRequestModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 1000,
            display: 'grid',
            placeItems: 'center',
            padding: '20px',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '500px',
              width: '100%',
              padding: '26px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  Salary Advance Application
                </h2>
                <small style={{ color: '#64748b' }}>
                  Eligible for up to 50% of monthly net salary ({formatCurrency(maxAllowedAdvance)} max).
                </small>
              </div>
              <button
                type="button"
                onClick={() => setIsRequestModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRequestSubmit}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Requested Advance Amount (₹) *
                </label>
                <input
                  type="number"
                  required
                  min="1000"
                  max={maxAllowedAdvance}
                  step="500"
                  value={requestAmount}
                  onChange={(e) => setRequestAmount(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '11px', color: '#64748b' }}>
                  <span>Min: ₹1,000</span>
                  <span>Max Allowable: {formatCurrency(maxAllowedAdvance)}</span>
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Repayment Tenure *
                </label>
                <select
                  value={requestTenure}
                  onChange={(e) => setRequestTenure(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                >
                  <option value="1">1 Month (100% deduction on next payroll)</option>
                  <option value="2">2 Months (50% deduction each month)</option>
                  <option value="3">3 Months (Recommended)</option>
                  <option value="6">6 Months (Extended emergency repayment)</option>
                </select>
              </div>

              {/* Deduction calculation box */}
              <div style={{ padding: '12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: 600 }}>Monthly Payroll Deduction:</span>
                  <strong style={{ fontSize: '16px', color: '#1d4ed8' }}>{formatCurrency(calculatedMonthlyDeduction)} / mo</strong>
                </div>
                <small style={{ display: 'block', color: '#3b82f6', fontSize: '11.5px', marginTop: '3px' }}>
                  Automatically withheld from end-of-month salary register. Zero interest.
                </small>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                  Purpose / Justification *
                </label>
                <select
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '7px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                >
                  <option value="Emergency Medical Treatment">Emergency Medical Treatment</option>
                  <option value="Educational Tuition Fees">Educational Tuition Fees</option>
                  <option value="Family Home Relocation">Family Home Relocation</option>
                  <option value="Vehicle Repair / Commute">Vehicle Repair / Commute</option>
                  <option value="Festival / Family Welfare">Festival / Family Welfare</option>
                  <option value="Other Personal Contingency">Other Personal Contingency</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '11px', color: '#475569', lineHeight: 1.4 }}>
                  <input
                    type="checkbox"
                    checked={agreedTerms}
                    onChange={(e) => setAgreedTerms(e.target.checked)}
                    style={{ marginTop: '2px' }}
                  />
                  <span>
                    I confirm this advance will be recovered automatically in {requestTenure} monthly installments from my net salary starting on the upcoming payroll cutoff.
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: '13px', fontWeight: 650, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!agreedTerms}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    background: agreedTerms ? '#155eef' : '#94a3b8',
                    color: '#fff',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: agreedTerms ? 'pointer' : 'not-allowed',
                  }}
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SCHEDULE & BREAKDOWN MODAL */}
      {selectedAdvance && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            zIndex: 1000,
            display: 'grid',
            placeItems: 'center',
            padding: '20px',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '26px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#155eef', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Payroll Recovery Schedule
                </span>
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '2px 0 0', color: '#0f172a' }}>
                  {selectedAdvance.code} · {selectedAdvance.employeeName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAdvance(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#64748b', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '18px', background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
              <div>
                <small style={{ color: '#64748b', fontSize: '11.5px', fontWeight: 700 }}>PRINCIPAL</small>
                <div style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>{formatCurrency(selectedAdvance.principalAmount)}</div>
              </div>
              <div>
                <small style={{ color: '#64748b', fontSize: '11.5px', fontWeight: 700 }}>REPAID</small>
                <div style={{ fontWeight: 800, fontSize: '15px', color: '#16a34a' }}>{formatCurrency(selectedAdvance.totalRepaid)}</div>
              </div>
              <div>
                <small style={{ color: '#64748b', fontSize: '11.5px', fontWeight: 700 }}>REMAINING</small>
                <div style={{ fontWeight: 800, fontSize: '15px', color: '#d97706' }}>{formatCurrency(selectedAdvance.remainingBalance)}</div>
              </div>
            </div>

            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#334155', margin: '0 0 10px' }}>
              Monthly Payroll Deductions
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {Array.from({ length: selectedAdvance.tenureMonths }).map((_, idx) => {
                const isPaid = idx < selectedAdvance.installmentsPaid;
                const isCurrent = idx === selectedAdvance.installmentsPaid && selectedAdvance.status === 'ACTIVE';

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: isPaid ? '#bbf7d0' : isCurrent ? '#bfdbfe' : '#e2e8f0',
                      background: isPaid ? '#f0fdf4' : isCurrent ? '#eff6ff' : '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: isPaid ? '#16a34a' : isCurrent ? '#2563eb' : '#e2e8f0',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                          Installment #{idx + 1}
                        </strong>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                          Payroll Month {idx + 1}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>
                        {formatCurrency(selectedAdvance.monthlyDeduction)}
                      </strong>
                      <div>
                        {isPaid && <span style={{ fontSize: '11.5px', color: '#16a34a', fontWeight: 700 }}>✓ Withheld</span>}
                        {isCurrent && <span style={{ fontSize: '11.5px', color: '#2563eb', fontWeight: 700 }}>⏳ Upcoming</span>}
                        {!isPaid && !isCurrent && <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>Scheduled</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setSelectedAdvance(null)}
                style={{ padding: '8px 18px', borderRadius: '7px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', fontSize: '12px', fontWeight: 650, cursor: 'pointer' }}
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
