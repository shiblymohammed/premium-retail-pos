import { getStoredSession } from '@/lib/auth';

const BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export async function staffRequest<T>(path: string, signal?: AbortSignal, body?: object, method = body ? 'POST' : 'GET'): Promise<T> {
  const token = getStoredSession()?.accessToken;
  if (!token) throw new Error('Sign in again to access staff records.');
  const response = await fetch(BASE + '/staff-records' + path, {
    method, signal, cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || 'Could not load staff records.');
  return payload.data;
}

export type PayrollRow = {
  id: string; period: string; currency: string; base: string; allowances: string; bonus: string;
  overtimePay: string; attendanceDeduction: string;
  attendanceBasis?: { overtimeMinutes: number; lateDays: number; absences: string[] } | null;
  deductions: string; advanceRecovery: string; net: string; paidAt: string | null; paymentReference: string | null;
};

export const payFields = {
  base: 'Basic pay',
  allowances: 'Allowances',
  bonus: 'Bonus',
  overtimePay: 'Overtime pay',
  attendanceDeduction: 'Attendance deduction',
  deductions: 'Deductions',
  advanceRecovery: 'Advance or loan recovery',
} as const;

export function money(value: string | number, currency: string) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value));
}
