import Link from 'next/link';
import SalesPermissionsAdmin from './screen';

export default function SalesPermissionsPage() {
  return <>
    <div className="app-page"><Link className="admin-secondary" href="/admin/sales-permissions/access">Per-person permissions</Link></div>
    <SalesPermissionsAdmin />
  </>;
}
