# UI Specification: Global Side Navigation Bar (`Sidebar`)

## 1. What is the Side Navigation Bar?
The **Side Navigation Bar** is the persistent global backbone of the POS application. It remains anchored to the left of the viewport across all views (Dashboard, Products, Sales Controls, Audits, Attendance, Reports, Admin Settings), providing instant role-aware navigation, location tenant switching, and cashier/manager profile identity.

---

## 2. Structural Breakdown (Top to Bottom)

### 2.1 Brand Header & Collapse Toggle
- **Brand Mark Icon:** Distinct high-contrast brand emblem (e.g. `P` square badge).
- **Brand Name & System Tagline:**
  - Primary text: **Premium Retail**
  - Subtitle: `RETAIL OPERATIONS`
- **Sidebar Collapse / Expand Button (`‹` / `›`):**
  - Allows toggling the sidebar between **Expanded Mode** (full labels and badges, 240px–260px width) and **Compact Icon-Only Mode** (64px width with hover tooltips).
  - Remembers user preference in `localStorage`.

### 2.2 Location Scope Selector Widget
- **Location Pin Icon:** Visual indicator of physical building.
- **Eyebrow Label:** `VIEWING LOCATION`.
- **Dynamic Store Switcher Dropdown:**
  - Options:
    - `All retail locations` (Consolidated multi-store view)
    - Individual Retail Stores (e.g., `Downtown Store`, `North Mall`, `West End Outlet`)
    - Warehouses (e.g., `Main Central Warehouse`)
- **Dual-Axis Role Enforcement (Invariant 11):**
  - **Cashier & Store Manager:** Dropdown is locked strictly to their assigned physical store; switching to other branches is disabled.
  - **Admin & Super Admin:** Dropdown is open, allowing instant switching between any branch to inspect localized inventory and sales.
- **Context Hint:** Subtitle text updating dynamically: *"Sales and stock in this view"*.

---

## 3. Navigation Sections & Itemized Links

Navigation links are grouped into 5 clear logical sections with section divider labels:

### Section 1: WORKSPACE (Daily Retail Floor Operations)
1. **Dashboard** (`/dashboard`)
   - *Icon:* `Grid / Layout`
   - *Purpose:* Central overview of daily turnover, ticket counts, stock states, and recent invoices.
   - *Active Indicator:* Highlighted pill when on `/dashboard`.
2. **Sales & POS Terminal** (`/`)
   - *Icon:* `Receipt / Cash Register`
   - *Purpose:* Opens the high-speed barcode scanning and checkout lane.
   - *Badge:* Shows active cart items count if a sale is currently in progress.
3. **Inventory & Products** (`/products`)
   - *Icon:* `Box / Package`
   - *Purpose:* Master product catalogue, SKU search, carton-to-packet ratios, and live shelf stock.
   - *Alert Badge:* Displays amber count tag if any item is at Low Stock.
4. **Stock Audits** (`/audits`)
   - *Icon:* `Shield / Clipboard Check`
   - *Purpose:* Periodic physical stocktakes, ADR-010 location freeze, blind count entry, and variance reconciliation.
   - *Lock Indicator:* Shows a blue lock icon if the location is currently frozen for an active audit.

### Section 2: WORKFORCE & SHIFTS
5. **Staff Attendance** (`/attendance`)
   - *Icon:* `Clock / Fingerprint`
   - *Purpose:* Staff-facing daily check-in/out, rotating workplace QR verification, and shift timeline.
6. **Attendance Management** (`/attendance/manage`)
   - *Icon:* `Users / Calendar Check`
   - *Role Gate:* Visible only to `STORE_MANAGER`, `ADMIN`, `SUPER_ADMIN`.
   - *Purpose:* Supervisor controls to set shift arrival times, project live rotating QR wallboard, review daily staff registers, and execute punch corrections.

### Section 3: LOGISTICS & WAREHOUSING
7. **Transfers & Replenishment** (`/operations` or `/transfers`)
   - *Icon:* `Arrow Left-Right / Truck`
   - *Purpose:* Tracking stock dispatched from warehouses, in-transit manifests (`OD-05`), and store receipt confirmation.
   - *Status Counter:* Shows count of shipments currently in transit.
8. **Warehouse Operations** (`/operations` or `/warehouse`)
   - *Icon:* `Warehouse / Building`
   - *Role Gate:* Visible to Warehouse Managers and Admins.
   - *Purpose:* Inward supplier receiving, carton repackaging, bulk pallet storage, and damage write-offs.

### Section 4: INTELLIGENCE & AUDIT
9. **Reports & Analytics** (`/reports`)
   - *Icon:* `Bar Chart / Document Report`
   - *Purpose:* 9 analytical reports (Sales, Stock ledger, Price changes, Cancellations, Item deletions) with native PDF and CSV exports.

### Section 5: SETTINGS & GOVERNANCE (Managers & Admins Only)
10. **Discount Limits** (`/admin/discount-limits`)
    - *Icon:* `Percentage / Sliders`
    - *Purpose:* Configuring cashier and manager maximum discount caps (`OD-07`).
11. **Sale Permissions** (`/admin/sales-permissions`)
    - *Icon:* `User Shield / Key`
    - *Purpose:* Granting or revoking `canCancelSales` and `canProcessReturns` per employee (`OD-08`).
12. **Returns & Cancellations** (`/sales-controls`)
    - *Icon:* `Settings / Arrow Undo`
    - *Purpose:* Permitted operator bench to void bills with ledger reversals and process item returns with restock/quarantine inspection.

---

## 4. Bottom Utility Card: Operations Test Bench
- **Promo Card Box:**
  - Icon: Small chip/terminal icon.
  - Heading: **Developer & API Bench**
  - Subtext: *Run Phases 1–6 automated workflows.*
  - Direct Action Link: `Open Test Bench →` (`/operations`).

---

## 5. Sidebar Footer: User Profile & Session Controls
- **User Avatar:** Circular avatar badge with user initials (e.g. `SM` for Sam Morgan or `RM` for Ravi Menon).
- **User Details:**
  - **Full Name:** Bold label (e.g. *Sam Morgan*).
  - **Assigned Role Badge:** Micro-tag indicating discrete role: `SUPER_ADMIN`, `ADMIN`, `STORE_MANAGER`, or `CASHIER`.
- **Session Actions:**
  - `Sign Out` button (revokes active JWT session via `/lib/auth`).
  - `Switch Profile / Terminal Lock` button for fast cashier shift handoffs.

---

## 6. Responsive & UX Polish Requirements
- **Active Route Highlighting:** Current page link has high-contrast background and left border accent.
- **Hover Micro-Interactions:** Subtle background transition (0.15s ease) and icon shift on hover.
- **Collapsed State (Icon-Only):**
  - Tooltips appear on hover displaying the link title and keyboard shortcut.
  - Location switcher condenses into a single pin icon that opens a flyout menu.
- **Mobile Responsive Drawer:** On small screens (tablet/mobile), the sidebar collapses offscreen into a slide-over hamburger drawer with backdrop blur.
