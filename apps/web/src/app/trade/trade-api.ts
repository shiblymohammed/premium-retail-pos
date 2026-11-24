const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export async function tradeRequest<T>(path: string, token: string, signal?: AbortSignal, body?: object): Promise<T> {
  const response = await fetch(API + path, {
    method: body ? 'POST' : 'GET', signal, cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'The request could not be completed.');
  return result.data;
}
