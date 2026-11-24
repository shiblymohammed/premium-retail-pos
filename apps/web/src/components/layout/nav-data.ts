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
    title: 'Home',
    links: [
      {
        label: 'Overview',
        href: '/dashboard',
        icon: 'dashboard',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER', 'CASHIER', 'STAFF'],
      },
      {
        label: 'Reports',
        href: '/reports',
        icon: 'reports',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER'],
      },
    ],
  },
  {
    title: 'Sales',
    links: [
      {
        label: 'Checkout',
        href: '/pos-terminal',
        icon: 'pos',
        roles: ['CASHIER'],
      },
      {
        label: 'Returns',
        href: '/sales-controls',
        icon: 'returns',
        // Visibility is gated by the signed-in user's cancellation/return
        // permissions in AppFrameLayout; Super Admin is allowed implicitly.
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER', 'CASHIER', 'STAFF'],
      },
    ],
  },
  {
    title: 'Stock',
    links: [
      {
        label: 'Products',
        href: '/products',
        icon: 'products',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER'],
      },
      {
        label: 'Stock Counts',
        href: '/audits',
        icon: 'audits',
        // Cashier and staff visibility is additionally gated by the server's
        // canCountStockAudits capability in AppFrameLayout.
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER', 'CASHIER', 'STAFF'],
      },
      {
        label: 'Transfers',
        href: '/operations',
        icon: 'transfers',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER'],
      },
    ],
  },
  {
    title: 'Team',
    links: [
      {
        label: 'Attendance',
        href: '/attendance/manage',
        icon: 'oversight',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER'],
      },
      {
        label: 'My Attendance',
        href: '/attendance',
        icon: 'attendance',
        roles: ['CASHIER', 'STAFF'],
      },
      {
        label: 'Users',
        href: '/admin/users',
        icon: 'users',
        roles: ['SUPER_ADMIN', 'ADMIN'],
      },
    ],
  },
  {
    title: 'Admin',
    links: [
      {
        label: 'Company',
        href: '/admin/company',
        icon: 'company',
        // This screen includes company-wide profile and organizational controls.
        // Scoped Admins manage users and operational permissions, not platform setup.
        roles: ['SUPER_ADMIN'],
      },
      {
        label: 'Discounts',
        href: '/admin/discount-limits',
        icon: 'discount',
        roles: ['SUPER_ADMIN', 'ADMIN'],
      },
      {
        label: 'Permissions',
        href: '/admin/sales-permissions',
        icon: 'permissions',
        roles: ['SUPER_ADMIN', 'ADMIN'],
      },
    ],
  },
  {
    title: 'Personal',
    links: [
      {
        label: 'Settings',
        href: '/settings',
        icon: 'settings',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER', 'CASHIER', 'STAFF'],
      },
    ],
  },
];

export const LOCATIONS: string[] = [];

export const LOCATION_KEY = 'premium-retail-location-scope';
