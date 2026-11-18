# Page Specification: Admin Sales Permissions (`/admin/sales-permissions`)

## 1. What is this Page?
The **Sales Permissions Management** screen allows store administrators to grant or revoke authority for invoice cancellations (voids) and customer return processing on a user-by-user basis (`OD-08`).

---

## 2. User Directory & Filter Bar
- **Search Field:** Search staff by name, email, or employee code.
- **Store Location Filter:** Filters staff assigned to a specific store branch.
- **Role Filter:** Filter by `STORE_MANAGER`, `CASHIER`, or `ADMIN`.

---

## 3. Permissions Matrix Table

### Table Columns & Controls
1. **Staff Member:** Name, email, and avatar initials.
2. **Assigned Role & Store:** Role badge and primary physical store location.
3. **`Can Cancel Sales` Toggle (`canCancelSales`):**
   - Interactive toggle switch.
   - When enabled, the user can access the invoice cancellation panel on `/sales-controls` to void bills.
   - When disabled, any void attempt is rejected with HTTP 403 Forbidden.
   - Displays warning tooltip: *"Grants authority to void finalized invoices and trigger inventory reversal movements."*
4. **`Can Process Returns` Toggle (`canProcessReturns`):**
   - Interactive toggle switch.
   - When enabled, allows the user to accept returned items, inspect goods, and issue refunds.
5. **Last Updated Indicator:** Displays timestamp and the administrator who last modified this permission.

---

## 4. Bulk Governance Actions
- `Enable Returns for all Store Managers`: One-click setup granting return permissions to all store supervisors.
- `Revoke All Cashier Voids`: Emergency lockdown button ensuring regular cashiers cannot cancel sales.
