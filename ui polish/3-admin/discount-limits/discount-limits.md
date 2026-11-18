# Page Specification: Admin Discount Limits (`/admin/discount-limits`)

## 1. What is this Page?
The **Discount Limits Management** screen is an administrative governance tool used to configure and enforce maximum percentage discount limits across cashiers and store managers. It enforces policy `OD-07`, ensuring that operators cannot give away unauthorized discounts, and preventing rogue administrators from granting limits higher than their own authority.

---

## 2. Administrator Authorization Banner
- **Current Admin Authority Cap:** Displays the maximum discount percentage the currently logged-in administrator is permitted to grant (e.g. *Your maximum authority cap: 20.00%*). Super Admin is displayed as *Uncapped*.
- **Why is it needed?** Under `OD-07`, an Admin cannot delegate discount powers higher than what headquarters granted them.

---

## 3. Role Default Templates Section
- **What is it?** A table defining default baseline discount percentages for roles when new employees are hired:
  - `CASHIER`: Default 5.00% Line / 5.00% Bill.
  - `STORE_MANAGER`: Default 15.00% Line / 15.00% Bill.
  - `STAFF`: Default 0.00% (No discount permissions).
- **Save Action:** Updates baseline settings for future account creations.

---

## 4. Per-User Custom Discount Overrides Table

### Table Columns & Controls
1. **User Identity:** Cashier or manager full name, email, and employee code.
2. **Role Badge:** `CASHIER` or `STORE_MANAGER`.
3. **Assigned Store Location:** Retail branch where this limit applies.
4. **Current Maximum Discount % Input:**
   - Numerical input formatted to 2 decimal places (e.g., `5.00%`).
   - **Enforcement Validation:** If an administrator enters `25.00%` when their own cap is `20.00%`, the field turns red with an immediate validation blocker: *"Limit exceeds your maximum administrator authorization (20.00%)."*
5. **Save Button:**
   - Commits the updated limit to the backend via `PATCH /api/v1/sales/discount-limits/users/:userId`.
   - Records an immutable audit log entry capturing the change.

---

## 5. Business Rules & Edge Cases (`OD-07`)
- **No Cashier Stacking:** Cashier cannot combine line and bill discounts.
- **No Live Override Workflow:** If a customer demands a discount higher than the cashier's cap, the POS terminal does not send a real-time request to the manager; instead, the store manager must walk over and authenticate directly on the terminal.
