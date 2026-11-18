# Admin · Inter-Store & Warehouse Transfer Oversight

## 1. Executive Summary & Page Purpose
The **Transfer Oversight** view tracks the end-to-end lifecycle of inventory movements between locations (Warehouse to Store, Store to Store, Warehouse to Warehouse). Administrators can inspect transfer manifests, verify transit aging, and resolve delivery quantity disputes.

## 2. Target Role & Access Control
- **Primary Role:** `ADMIN`, `SUPER_ADMIN`
- **State Machine Enforced:** `DRAFT` → `PENDING_APPROVAL` → `APPROVED` → `DISPATCHED` → `RECEIVED` (or `REJECTED` / `CANCELLED`).

## 3. UI Pipeline & Kanban View
- **Status Columns:**
  1. **Pending Approval:** Store replenishment requests awaiting manager signoff.
  2. **Approved / Staging:** Approved orders currently being picked in the warehouse.
  3. **In Transit (`OD-05`):** Dispatched shipments on the road. Displays carrier tracking, departure time, and expected arrival.
  4. **Completed / Reconciled:** Received transfers with zero discrepancy.
  5. **Discrepancy / Damaged:** Shipments where received good units was less than dispatched units, with units redirected to quarantine.
