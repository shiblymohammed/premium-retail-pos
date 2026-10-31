/**
 * @pos/shared — Shared types, enums, and constants
 * Used by both the API backend and web frontend.
 */

// Re-export role enum for frontend authorization checks
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  CENTRAL_MANAGER = 'CENTRAL_MANAGER',
  SUB_WAREHOUSE_MANAGER = 'SUB_WAREHOUSE_MANAGER',
  STORE_MANAGER = 'STORE_MANAGER',
  CASHIER = 'CASHIER',
  STAFF = 'STAFF',
}

export enum LocationTypeEnum {
  MAIN_WAREHOUSE = 'MAIN_WAREHOUSE',
  SUB_WAREHOUSE = 'SUB_WAREHOUSE',
  RETAIL_STORE = 'RETAIL_STORE',
}

// API response wrapper type
export interface ApiResponse<T = unknown> {
  message?: string;
  data: T;
}

// Token pair from auth endpoints
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
