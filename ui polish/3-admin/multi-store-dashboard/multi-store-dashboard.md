# Page Specification: Operations & Executive Dashboard (`/dashboard`)

## 1. What is this Page?
The **Operations & Executive Dashboard** provides store managers, regional admins, and super admins with a real-time operational bird's-eye view of store performance. It aggregates daily sales revenue, transaction velocity, inventory health across 4 ledger states, warehouse transfer pipelines, and recent invoices.

---

## 2. Header & Location Scope Controls

### Brand Identity & Title
- Displays the application brand: *Premium Retail · Retail Operations*.

### Store Location Selector Dropdown
- **What is it?** A dropdown menu allowing users to toggle between:
  - `All retail locations` (Consolidated view across all branches)
  - `Downtown Store`
  - `North Mall`
  - `West End Outlet`
- **Why is it needed?**
  - Regional admins need to view performance across the entire chain.
  - Store managers only care about their own store. If a store manager logs in, this dropdown is locked strictly to their assigned branch.
- **How does it work?** Selecting a location immediately recalculates all KPI cards, stock levels, transfer alerts, and invoice feeds to match that location's scope.

### Header Notification Bell & Alerts Trigger
- Displays a red notification dot if any low-stock or negative-stock conditions exist in the selected location scope. Clicking jumps to the operational safeguards drawer.

---

## 3. High-Level Metric Cards (KPI Row)

### Card 1: Today's Net Sales
- **What it shows:** Total currency volume of completed sales today (e.g. `₹92,140.00` for Downtown Store or `₹248,650.00` for all stores).
- **Why it is needed:** Immediate indication of whether the store is hitting daily sales targets.
- **Features:** Shows percentage comparison against the previous week.

### Card 2: Total Invoices Finalized
- **What it shows:** Total count of customer transactions completed today (e.g., `437 invoices`).
- **Why it is needed:** Measures customer footfall velocity and cashier lane activity.
- **Features:** Calculates average spend per basket: $\text{Avg Ticket} = \frac{\text{Net Sales}}{\text{Invoice Count}}$.

### Card 3: Low Stock Attention Variants
- **What it shows:** Count of product variants currently at or below their reorder threshold (e.g., `7 variants`).
- **Why it is needed:** Prevents stockouts of high-demand items.
- **Action:** Clicking "Review →" navigates directly to `/products` with the low-stock filter pre-activated.

### Card 4: Negative Stock Ledger Balances (`OD-03`)
- **What it shows:** Count of items where available stock is below 0 (e.g., `1 variant`).
- **Why it is needed:** Under business rule `OD-03`, sales are permitted even when system inventory is zero. This card alerts management that physical items were sold before the inward shipment was registered, requiring stock reconciliation.
- **Action:** Highlighted in bold amber/red alert style.

---

## 4. Ledger Stock Breakdown Panel (Stock by State)

- **What is it?** A visual breakdown of inventory across the four canonical ledger states defined in the project architecture:
  1. **Available Stock:** Units on shelves ready for customer purchase (e.g., `3,110 base units`).
  2. **In-Transit Stock (`OD-05`):** Stock dispatched from the central warehouse that is currently on the road (e.g., `210 base units`). *Key Rule: In-transit stock cannot be sold at the destination store until receipt is confirmed.*
  3. **Reserved Stock:** Units set aside for pending orders or transfers (e.g., `90 base units`).
  4. **Quarantined Stock:** Damaged, expired, or returned defective items held in isolation (e.g., `16 base units`).
- **Why is it needed?** Traditional POS systems only show a single number ("in stock"), leading to situations where items on delivery trucks are mistakenly promised to customers. Segregating these 4 states guarantees inventory integrity.
- **Action:** Button to "Open Inventory Ledger" (`/products`).

---

## 5. Warehouse Transfers & Replenishment Panel

- **What is it?** A live list of incoming and outgoing stock shipments between warehouses and stores.
- **What is inside each transfer row?**
  1. **Transfer ID:** E.g., `TR-2026-0314`.
  2. **Origin & Destination:** E.g., *Central Warehouse → Downtown Store*.
  3. **Status Pill:**
     - `In Transit` (Blue): Goods dispatched and on the road.
     - `Pending Approval` (Amber): Store requested replenishment, awaiting warehouse manager signoff.
     - `Completed` (Green): Goods received and verified.
  4. **Unit Progress:** E.g., *58 of 72 units dispatched*.
- **Why is it needed?** Store managers need to know when delivery trucks are arriving and what items are inside so they can plan shelf restocking.

---

## 6. Recent Store Invoices Table

- **What is it?** A live feed of the latest transactions rung up across all cashier lanes.
- **Table Columns:**
  1. **Invoice Number:** E.g., `INV-2026-0842`. Clicking opens the receipt preview modal.
  2. **Cashier:** Full name, initials avatar, and lane number.
  3. **Store Location:** Retail branch where the sale occurred.
  4. **Time:** Timestamp formatted in local store time (e.g., `10:42 AM`).
  5. **Items Count:** Total quantity of units in the basket.
  6. **Discount Applied:** Percentage or flat discount applied to the bill.
  7. **Payment Method:** `Cash`, `Card`, or `Online`.
  8. **Amount:** Total net bill amount.
  9. **Status Badge:**
     - `Completed` (Green): Normal valid sale.
     - `Return recorded` (Amber): A customer returned one or more items from this bill (`OD-08`).
     - `Cancelled` (Red): The entire invoice was voided by a manager (`OD-08`).
- **Table Actions:**
  - `Export CSV`: Downloads raw invoice records for accounting.
  - `Open POS Terminal`: Shortcut button to ring up a new sale.
  - `Sales Controls`: Shortcut button to void or return an invoice.
