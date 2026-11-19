'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession, getRoleHomeRoute } from '@/lib/auth';
import PosTerminal from './pos-terminal';

export default function Home() {
  const router = useRouter();
  const [isCashier, setIsCashier] = useState<boolean | null>(null);

  useEffect(() => {
    const session = getStoredSession();
    const role = session?.user?.role;
    if (role && role !== 'CASHIER') {
      // Management, warehouse, and floor staff do not operate cashier checkouts;
      // route to their dedicated workspace.
      router.replace(getRoleHomeRoute(role));
    } else {
      setIsCashier(true);
    }
  }, [router]);

  if (isCashier === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fafc', color: '#64748b' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #cbd5e1', borderTopColor: '#155eef', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }}></div>
          <small style={{ fontSize: '12px', fontWeight: 600 }}>Loading workspace…</small>
        </div>
      </div>
    );
  }

  return <PosTerminal />;
}
