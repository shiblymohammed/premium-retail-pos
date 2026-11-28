import { redirect } from 'next/navigation';

export default async function StaffPermissionsPage({ searchParams }: { searchParams: Promise<{ user?: string | string[] }> }) {
  const { user } = await searchParams;
  redirect(typeof user === 'string' && user
    ? `/admin/sales-permissions?user=${encodeURIComponent(user)}`
    : '/admin/sales-permissions');
}
