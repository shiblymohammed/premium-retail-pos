export interface NavLink {
  label: string;
  href: string;
  icon: string;
  roles: string[];
}

export interface NavGroup {
  title: string;
  links: NavLink[];
}

export const ALL_NAV_GROUPS: NavGroup[] = [
  {
    title: 'WORKSPACE',
    links: [
      {
        label: 'Sales & POS',
        href: '/',
        icon: 'pos',
        roles: ['CASHIER'],
      },
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: 'dashboard',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER'],
      },
      {
        label: 'Reports & Analytics',
        href: '/reports',
        icon: 'reports',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER'],
      },
    ],
  },
  {
    title: 'INVENTORY & AUDITS',
    links: [
      {
        label: 'Products & Stock',
        href: '/products',
        icon: 'products',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER'],
      },
      {
        label: 'Stock Audits',
        href: '/audits',
        icon: 'audits',
        // Cashier and staff visibility is additionally gated by the server's
        // canCountStockAudits capability in AppFrameLayout.
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER', 'CASHIER', 'STAFF'],
      },
    ],
  },
  {
    title: 'LOGISTICS & OPERATIONS',
    links: [
      {
        label: 'Transfers & Logistics',
        href: '/operations',
        icon: 'transfers',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER'],
      },
      {
        label: 'Returns & Cancellations',
        href: '/sales-controls',
        icon: 'returns',
        // Visibility is gated by the signed-in user's cancellation/return
        // permissions in AppFrameLayout; Super Admin is allowed implicitly.
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER', 'CASHIER', 'STAFF'],
      },
    ],
  },
  {
    title: 'WORKFORCE & SHIFTS',
    links: [
      {
        label: 'Attendance Oversight',
        href: '/attendance/manage',
        icon: 'oversight',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER'],
      },
      {
        label: 'Staff Attendance',
        href: '/attendance',
        icon: 'attendance',
        roles: ['CASHIER', 'STAFF'],
      },
    ],
  },
  {
    title: 'SETTINGS & PREFERENCES',
    links: [
      {
        label: 'My Settings',
        href: '/settings',
        icon: 'settings',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER', 'CASHIER', 'STAFF'],
      },
      {
        label: 'User Directory',
        href: '/admin/users',
        icon: 'users',
        roles: ['SUPER_ADMIN', 'ADMIN'],
      },
      {
        label: 'Company & Locations',
        href: '/admin/company',
        icon: 'company',
        // This screen includes company-wide profile and organizational controls.
        // Scoped Admins manage users and operational permissions, not platform setup.
        roles: ['SUPER_ADMIN'],
      },
      {
        label: 'Discount Limits',
        href: '/admin/discount-limits',
        icon: 'discount',
        roles: ['SUPER_ADMIN', 'ADMIN'],
      },
      {
        label: 'Sale Permissions',
        href: '/admin/sales-permissions',
        icon: 'permissions',
        roles: ['SUPER_ADMIN', 'ADMIN'],
      },
    ],
  },
];

export const LOCATIONS: string[] = [];

export const LOCATION_KEY = 'premium-retail-location-scope';
