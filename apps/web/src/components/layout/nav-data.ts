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
        icon: '▣',
        roles: ['CASHIER'],
      },
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: '▦',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER'],
      },
      {
        label: 'Reports & Analytics',
        href: '/reports',
        icon: '▤',
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
        icon: '◇',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER'],
      },
      {
        label: 'Stock Audits',
        href: '/audits',
        icon: '◫',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER'],
      },
    ],
  },
  {
    title: 'LOGISTICS & OPERATIONS',
    links: [
      {
        label: 'Transfers & Logistics',
        href: '/operations',
        icon: '⇄',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER'],
      },
      {
        label: 'Returns & Cancellations',
        href: '/sales-controls',
        icon: '↩',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER'],
      },
    ],
  },
  {
    title: 'WORKFORCE & SHIFTS',
    links: [
      {
        label: 'Attendance Oversight',
        href: '/attendance/manage',
        icon: '♙',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER'],
      },
      {
        label: 'Staff Attendance',
        href: '/attendance',
        icon: '◷',
        roles: ['CASHIER', 'STAFF'],
      },
      {
        label: 'Loans & Advances',
        href: '/attendance/loans',
        icon: '◈',
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
        icon: '⚙',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'CENTRAL_MANAGER', 'WAREHOUSE_MANAGER', 'SUB_WAREHOUSE_MANAGER', 'CASHIER', 'STAFF'],
      },
      {
        label: 'User Directory',
        href: '/admin/users',
        icon: '👥',
        roles: ['SUPER_ADMIN', 'ADMIN'],
      },
      {
        label: 'Company & Locations',
        href: '/admin/company',
        icon: '🏛',
        roles: ['SUPER_ADMIN', 'ADMIN'],
      },
      {
        label: 'Discount Limits',
        href: '/admin/discount-limits',
        icon: '◇',
        roles: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER'],
      },
      {
        label: 'Sale Permissions',
        href: '/admin/sales-permissions',
        icon: '⚿',
        roles: ['SUPER_ADMIN', 'ADMIN'],
      },
    ],
  },
];

export const LOCATIONS = [
  'All retail locations',
  'Downtown Store',
  'North Mall',
  'West End Outlet',
  'Central Warehouse',
];

export const LOCATION_KEY = 'premium-retail-location-scope';
