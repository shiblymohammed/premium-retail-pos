const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export async function getData<T>(path: string, token: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message : `Could not load ${path.split('?')[0]}.`);
  return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T;
}

export type Load<T> = T | null | undefined;

export async function read<T>(path: string, token: string, signal: AbortSignal): Promise<T | null> {
  try { return await getData<T>(path, token, signal); } catch { return null; }
}

export function metric(value: Load<number | string>): string {
  if (value === undefined) return 'Loading…';
  if (value === null) return 'Unavailable';
  return typeof value === 'number' ? value.toLocaleString('en-IN') : value;
}
