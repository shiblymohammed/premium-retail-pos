# Super Admin · Global Access Governance & Dual-Axis RBAC

## 1. Executive Summary & Page Purpose
The **Global Access Governance** interface provides high-level identity lifecycle management across all 7 discrete roles. Super Admins configure global permissions, supervise tenant access, revoke sessions for compromised accounts, and audit dual-axis authorization matrix enforcement.

## 2. Target Role & Access Control
- **Exclusive Role:** `SUPER_ADMIN`
- **Scope:** Global across all store branches, regional warehouses, and headquarters.

## 3. UI Matrix & Identity Features
- **7-Role Assignment Selector:** `SUPER_ADMIN`, `ADMIN`, `CENTRAL_MANAGER`, `SUB_WAREHOUSE_MANAGER`, `STORE_MANAGER`, `CASHIER`, `STAFF`.
- **Dual-Axis Inspector:** Shows the exact permissions matrix (Price edits, uncapped discounts, ledger adjustments, attendance oversight).
- **Emergency Revocation:** Button to invalidate all active JWT refresh tokens for a user or location node with immediate effect.
