'use client';

import { useEffect, useState } from 'react';
import { getStoredSession } from './auth';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');
export type AccessOverrides = Record<string, boolean>;

export function useAccess(token?: string) {
  const [overrides, setOverrides] = useState<AccessOverrides>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const accessToken = token ?? getStoredSession()?.accessToken;
    if (!accessToken) {
      setOverrides({});
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    async function read() {
      try {
        const response = await fetch(API + '/users/me/permissions', {
          headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('Could not load assigned permissions');
        const payload = await response.json();
        if (!controller.signal.aborted) setOverrides(payload.data || {});
      } catch {
        if (!controller.signal.aborted) setOverrides({});
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void read();
    const refresh = () => { if (document.visibilityState === 'visible') void read(); };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [token]);
  return { overrides, loading, can: (key: string, roleDefault: boolean) => overrides[key] ?? roleDefault };
}
