# Development Roadmap & Feature Tracker: Premium Retail POS

> Living task tracker, phase milestones, delivery priorities, and open business/technical decisions for the Premium Retail POS project.

---

## 1. Current Status

| Metric | Status / Assessment |
| :--- | :--- |
| **Current Baseline** | Phase 5 — Warehouse Transfers & Replenishment Approvals complete |
| **Implemented Functionality** | Phase 1–5 checklist complete; Phase 4 provides immutable movements and ledger balances, while Phase 5 adds replenishment drafts, transfer lifecycle, transit, receipt reconciliation, and cancellation reversals |
| **Partial Functionality** | Web UI remains a foundation screen; operational workflows in later phases remain planned |
| **Resolved Decisions** | 6 of 20 Open Decisions confirmed: `OD-01`, `OD-02`, `OD-03`, `OD-04`, `OD-07`, `OD-11` (see §5) |
| **Remaining Blockers** | 14 unresolved business/technical decisions; Phase 6+ modules blocked until `OD-08`, `OD-09`, `OD-10` resolved |
| **Foundation Status** | API/web builds pass; local PostgreSQL, initial migration, seed data, and seeded login have been verified by the project owner |

---

## 2. Current Focus

> [!IMPORTANT]
> **Phase 5: Warehouse Transfers & Replenishment Approvals — Complete**
> Phase 5 transfer/replenishment APIs and database migrations are implemented. Cashier-facing negative-stock warning presentation remains part of the Phase 6 POS interface.

### Immediate Next Tasks
- [x] **P0**: Formally review and resolve high-impact Open Decisions (`OD-01`, `OD-03`, `OD-04`, `OD-07`, `OD-11`) — ✅ Resolved
- [x] **P0**: Initialize repository architecture (Next.js frontend, NestJS backend, Prisma ORM, PostgreSQL schema) — ✅ Completed
- [x] **P0**: Implement secure authentication (bcrypt, JWT, refresh tokens) — ✅ Completed
- [x] **P0**: Implement dual-axis authorization guards (RBAC + Location Scoping) — ✅ Completed
- [x] **P0**: Start the local PostgreSQL service, apply the generated initial Prisma migration, and run the seed script — ✅ Verified by project owner

---

## 3. Priority Conventions

Each roadmap task is tagged with an industry-standard priority tier:
- **P0 — Essential Foundation / Release Blocker**: Architectural core, security safeguards, ledger integrity, and essential transactional paths.
- **P1 — Core Operational Functionality**: Essential retail workflows (carton/packet conversions, transfers, billing, discounts, audits, attendance, loans).
- **P2 — Important Operational Enhancement**: Dashboards, in-app alerts, advanced reporting, export utilities, and automated drafts.
- **P3 — Optional / Future Capability**: Secondary channels (SMS/WhatsApp), advanced hardware peripherals, and deferred accounting links.

---

## 4. Planned Development Phases

### Phase 1: Project Foundation, Environments, Authentication & Access Control
- [x] `P0` Initialize monorepo / application directory structure with TypeScript and ESLint (Prettier configuration is not part of the current scaffold)
- [x] `P0` Configure local containerized PostgreSQL database and run Prisma migrations — ✅ Verified by project owner
- [x] `P0` Design initial Prisma schema for Identity, Locations, Inventory, Sales, HR, and Auditing
- [x] `P0` Implement secure authentication (bcrypt password hashing, JWT token issuance, single active refresh-token rotation with reuse rejection)
- [x] `P0` Implement role authorization for protected controllers and location scoping on location-bound endpoints and collection queries
- [x] `P0` Implement global request validation, normalized exception handling, and structured audit event logging interceptor

### Phase 2: Company Locations, Users, Roles & Employee Profiles
- [x] `P0` Implement Company entity and global configuration (currency, timezone, invoice numbering prefix)
- [x] `P0` Implement Location hierarchy: Main Warehouse, Sub-Warehouses, and Retail Stores
- [x] `P0` Implement soft-deactivation/archival for locations (cannot deactivate with active children, active transfers, or non-zero ledger balances; history remains preserved)
- [x] `P1` Implement User management (create, assign roles, assign allowed location scopes, deactivate)
- [x] `P1` Implement Employee profiles (employee code, full name, contact, workplace assignment, reporting manager)
- [x] `P1` Add Loans & Advances summary section placeholder to Employee profile

### Phase 3: Product Catalogue, Variants, SKU/Barcodes & Unit Conversions
- [x] `P0` Design Product and Variant entities with unique SKU and barcode indexes
- [x] `P0` Implement canonical inventory base unit definition per product (e.g., packet); prevent changing it after ledger movements exist
- [x] `P0` Implement configurable carton-to-packet conversion rates per product
- [x] `P1` Support products without variants and products with stock-distinct variants (size, colour, style)
- [x] `P1` Enforce packet-only tracking for products without carton conversions
- [x] `P0` Restrict product selling and purchase price changes strictly to Super Admin role
- [x] `P0` Implement price change audit log recording old price, new price, actor, timestamp, and reason
- [x] `P1` Implement mixed-unit formatted display utility (e.g., "27 packets = 2 cartons + 7 packets")

### Phase 4: Inventory Ledger, Opening Stock & Supplier Receiving
- [x] `P0` Design append-only immutable `InventoryMovement` ledger model
- [x] `P0` Implement stock balance queries aggregated strictly from the ledger
- [x] `P0` Model four distinct stock states: `Available`, `In transit`, `Reserved`, `Quarantined`
- [x] `P0` Implement ACID database transactions with location-row locks to serialize stock balance reads and ledger writes
- [x] `P0` Implement Negative Stock Policy backend (Confirmed `OD-03`): allow signed movements below zero, return negative balances, and include a prominent warning signal; cashier UI presentation is in Phase 6
- [x] `P1` Implement idempotent opening stock balance batch import utility
- [x] `P1` Implement Supplier Receiving module supporting full cartons and loose packets
- [x] `P1` Link confirmed supplier receipts to immutable movement ledger entries and the receiving user

### Phase 5: Warehouse Transfers & Replenishment Approvals
- [x] `P1` Implement automated draft replenishment request generation based on reorder thresholds (suggests enough base units to reach the configured reorder level; does not move or reserve stock)
- [x] `P1` Store system-suggested quantity separately from manager-approved quantity
- [x] `P0` Implement loose-packet and opened-carton warehouse transfer support (Confirmed `OD-01`: cartons can be opened and loose packets transferred between warehouses)
- [x] `P0` Implement transfer lifecycle state machine:
  - `Draft` &rarr; `Pending Approval` &rarr; `Approved` &rarr; `Partially Dispatched` / `Dispatched-In Transit` &rarr; `Partially Received` &rarr; `Received/Completed` (or `Rejected`/`Cancelled`)
- [x] `P0` Ensure dispatched transfer stock moves to `In transit` and is strictly excluded from destination available stock until confirmed receipt
- [x] `P0` Implement transfer cancellation reversal workflow (prohibit hard deletion of dispatched transfers)
- [x] `P1` Implement transfer receipt discrepancy recording (short/excess/damaged; damaged and excess quantities are quarantined)

### Phase 6: POS Billing, Invoices, Discounts & Sale Controls
- [ ] `P0` Implement cashier terminal binding to authorized retail store location
- [ ] `P0` Build high-speed POS cart interface supporting barcode scanning and variant lookup
- [ ] `P0` Display real-time location-scoped available stock (with negative value indicator and warning when below zero)
- [ ] `P0` Implement offline POS resilient queueing (Confirmed `OD-11`): POS keeps running without internet, caches transactions locally with idempotency keys, and automatically syncs to backend once connection is restored
- [ ] `P0` Implement active unfinalized bill item deletion auditing (log item, variant, quantity, cashier, time, optional staff popup)
- [ ] `P0` Implement dual-tier discount authorization engine (Confirmed `OD-07`):
  - Enforce limits at both line-item level AND overall bill level
  - Prohibit discount stacking to circumvent manager approval thresholds
  - Super Admin: Uncapped; Admin: Predefined threshold; Manager / Cashier: Strict assigned limit
  - Over-limit discount requires manager authorization popup, logging approver and reason
- [ ] `P0` Implement idempotent sale finalization generating unique sequential invoice numbers and atomic inventory deductions
- [ ] `P0` Implement completed-sale cancellation workflow:
  - Require explicit permission and documented reason
  - Preserve original invoice and line items intact
  - Generate corresponding financial and inventory movement reversal records
- [ ] `P1` Implement receipt layout printing support (thermal printer format)

### Phase 7: Stock Audits, Recounts & Approved Adjustments
- [ ] `P1` Implement location-level stock movement freeze during audit session (Confirmed `OD-04`: audits take place after store closing hours; system locks sales and transfers for the location during counting)
- [ ] `P1` Implement weekly physical stock audit session management by location and SKU/variant
- [ ] `P1` Implement configurable variance threshold rules (quantity variance, percentage variance, high-count alert)
- [ ] `P1` Implement Recount Required queue for flagged count variances
- [ ] `P1` Build manager review screen comparing Expected Stock, Count 1, and Recount
- [ ] `P0` Ensure physical counts do not mutate inventory balances until manager formally approves adjustment
- [ ] `P0` Generate immutable `STOCK_ADJUSTMENT` ledger movement upon approved audit reconciliation
- [ ] `P1` Archive full audit history (expected, count, recount, approved value, variance, approver, reason)

### Phase 8: Staff Mobile Attendance
- [ ] `P1` Build mobile-friendly staff attendance punch interface
- [ ] `P1` Implement dynamic workplace QR code generation with periodic expiration/rotation
- [ ] `P1` Implement mobile GPS geofence radius verification against assigned location coordinates
- [ ] `P1` Record employee, server timestamp, workplace ID, verification result, and exception flags
- [ ] `P1` Implement manager/HR attendance correction module with audit log of original punch and correction reason
- [ ] `P2` Generate daily, weekly, and monthly attendance summary reports

### Phase 9: Employee Loans and Advances
- [ ] `P1` Implement Loans & Advances profile section for employees
- [ ] `P1` Support multiple active and historical loans per employee (amount, issue date, terms, manager approval)
- [ ] `P0` Maintain running outstanding balance formula: $\text{Outstanding} = \text{Issued} - \text{Confirmed Repayments}$
- [ ] `P1` Implement repayment ledger supporting full, partial, and early repayments
- [ ] `P1` Link planned payroll deductions to repayment records without double-reducing balances prior to payroll confirmation
- [ ] `P1` Implement loan correction/reversal workflow retaining original audit history

### Phase 10: Reports, Dashboards & Notifications
- [ ] `P1` Implement location-scoped and consolidated Sales Summary & Sales Detail reports
- [ ] `P1` Implement Current Stock Report with base units and carton/packet breakdowns
- [ ] `P1` Implement Movement Ledger Audit Report with source/destination tracing
- [ ] `P1` Implement Low Stock & Replenishment Tracker
- [ ] `P1` Implement Transfer Discrepancy Report
- [ ] `P1` Implement Audit Variance Report and Price Change History Log
- [ ] `P1` Implement Item Deletion & Cancelled Sale Audit Report
- [ ] `P2` Implement role-scoped executive and manager dashboard widgets
- [ ] `P2` Implement in-app notification center (replenishment approvals, recount alerts, transfer discrepancies)
- [ ] `P2` Implement secure CSV and PDF export utilities respecting location permissions

### Phase 11: Security, Concurrency, Automated Tests & Hardening
- [ ] `P0` Enforce database constraints and unique indexes on SKUs, barcodes, invoice numbers, and idempotency keys
- [ ] `P0` Implement concurrency stress tests validating atomic sales against low stock (prevent race conditions)
- [ ] `P0` Implement comprehensive unit test suite covering unit conversions, discount capping, and loan balances
- [ ] `P0` Implement security tests verifying that cashiers cannot access external location stock or admin APIs
- [ ] `P0` Add rate limiting, HTTP security headers (Helmet), and strict CORS origin whitelisting
- [ ] `P0` Protect sensitive employee financial data and attendance geolocation data

### Phase 12: Deployment, Data Migration, Training & Handover
- [ ] `P1` Build standardized CSV data import templates for products, variants, opening stock, locations, and staff
- [ ] `P0` Set up automated database backup procedures and test restore recovery drills
- [ ] `P1` Deploy to staging environment and conduct end-to-end User Acceptance Testing (UAT)
- [ ] `P1` Produce role-specific operator guides (Super Admin, Store Manager, Cashier, Auditor)
- [ ] `P0` Execute production launch checklist and initiate contractual 30-day bug-fixing period

---

## 5. Open Decisions and Blockers (Must Confirm)

The following 20 open decisions (`OD-01` through `OD-20`) originate from Section 27 of the functional requirements specification. **Each decision must be formally decided with stakeholders and recorded before corresponding modules are coded.**

| Decision ID | Area | Open Question / Decision Description | Agreed Policy / Default Note | Status / Blocker Level |
| :--- | :--- | :--- | :--- | :--- |
| **OD-01** | Inventory | Can cartons be opened and loose packets transferred between warehouses? | **CONFIRMED: Yes.** Cartons can be opened and loose packets transferred between warehouses, as well as between warehouses and stores. | **RESOLVED** (Unblocks Transfer schema) |
| **OD-02** | Locations | Exact initial location hierarchy, branch counts, and direct replenishment routes. | Manual transfers may connect any two distinct active Main Warehouses, Sub-Warehouses, or Stores in the same company, including sibling and non-adjacent locations. Automated replenishment suggestions use the destination's configured parent as the proposed source. | **RESOLVED** (Same-company transfers across all location tiers) |
| **OD-03** | Stock Policy | Is negative stock ever permitted? | **CONFIRMED: Warning & Negative Display.** Sales are permitted to proceed; system displays a prominent cashier warning and records the balance as a negative value. | **RESOLVED** (Unblocks Ledger logic) |
| **OD-04** | Stock Audit | How are sales/transfers during an ongoing physical audit handled? | **CONFIRMED: Location Freeze (After Hours).** Audits occur when the store is closed; stock movements are frozen for the location until counting completes. | **RESOLVED** (Unblocks Audit flow) |
| **OD-05** | Audit Thresholds | Specific quantity and percentage variance thresholds triggering recount. | Set default thresholds per category (e.g., > 2% variance or > 5 units triggers mandatory recount). | Open / Medium (Blocks Audit config) |
| **OD-06** | Audit UX | Should physical stock audits be blind counts? | Decide whether counters can view expected stock quantities on screen. | Open / Medium (Blocks Audit UI) |
| **OD-07** | Discounts | Do discount limits apply per line item, per bill, or both? How is stacking handled? | **CONFIRMED: Both Line and Bill Limits.** Thresholds apply at both line-item level and overall cart level; discount stacking to bypass approval is strictly prohibited. | **RESOLVED** (Unblocks POS logic) |
| **OD-08** | Returns | Business rules for customer returns, refunds, and exchanges. | Define return windows, receipt verification, refund payment method, and restocking inspection. | Open / High (Blocks POS returns) |
| **OD-09** | Billing & Tax | Specific GST/tax calculations, tax breakdown display, legal invoice headers, and customer info. | Confirm legal tax requirements, GSTIN display, and sequential numbering rules. | Open / High (Blocks Invoice template) |
| **OD-10** | Payments | Supported payment modes (Cash, Card, UPI, Split) and payment gateway integration. | Support Cash, Card, UPI manual tracking initially; confirm if EDC card machine integration is required. | Open / High (Blocks Checkout flow) |
| **OD-11** | Offline Mode | Scope of offline-first operation vs. online-only operation. | **CONFIRMED: Online-First with Offline POS Resilient Queueing.** POS keeps running without internet, caches transactions locally with idempotency keys, and syncs automatically once online. | **RESOLVED** (Unblocks Client architecture) |
| **OD-12** | Attendance | Specific shift schedules, grace periods, break tracking, overtime rules, and geofence radius. | Set default 50-meter geofence, 15-minute grace period; confirm workplace coordinates. | Open / Medium (Blocks Attendance logic) |
| **OD-13** | Verification | Is facial recognition or liveness verification required for mobile attendance? | **Optional / Excluded from baseline**; conduct privacy, security, and hardware cost review first. | Deferred / Low |
| **OD-14** | Loans & HR | Is loan tracking purely internal, or does it interface with third-party payroll software? | Internal ledger tracking only in base scope; deduction schedules linked to repayment records. | Open / Medium (Blocks HR schema) |
| **OD-15** | Hardware | Target hardware specifications (barcode scanners, thermal printers, cash drawers, scales). | Support standard USB/Bluetooth ESC/POS thermal printers and HID keyboard-wedge barcode scanners. | Open / Medium (Blocks POS driver testing) |
| **OD-16** | Exports | Supported export formats, scheduling, and role-based export permissions. | Support CSV and PDF download; restrict consolidated exports to Admin / Super Admin. | Open / Low (Reports module) |
| **OD-17** | Notifications | Scope of notification delivery (In-app only vs. SMS / Email / WhatsApp). | In-app alerts included in base scope; external SMS/WhatsApp excluded unless third-party gateway funded. | Open / Low (External costs) |
| **OD-18** | Data Migration | Scope and format of legacy data to migrate (products, stock, employees, historic sales). | Provide standard CSV import templates for master catalogue and opening stock balances only. | Open / Medium (Pre-launch readiness) |
| **OD-19** | Scale Targets | Concurrency targets: concurrent cashiers, active SKUs, daily transactions, data retention span. | Design for 50+ stores, 10,000+ SKUs, 50,000 daily sales, 5-year online retention. | Open / Medium (Database indexing) |
| **OD-20** | Acceptance | Formal UAT sign-off criteria, bug severity definitions, and commercial support timeline. |   Define Sev-1 through Sev-4 response times and confirm start date for the 30-day bug-fixing period. | Open / High (Contractual milestone) |

---

## 6. Deferred & Out-of-Scope Capabilities

As defined in Section 2.2 of the specification, the following capabilities are **explicitly out-of-scope** for the initial ₹70,000 commercial package and must not be assumed without separate approved change orders:

- **Full Accounting / General Ledger**: Balance sheets, P&L generation, tax filing, e-invoicing, e-way bills.
- **Customer Facing Applications**: Consumer mobile app, e-commerce web storefront, loyalty points, marketing campaigns.
- **Supplier Portal & Purchase Orders**: Supplier self-service portal, formal purchase order approvals, and accounts payable.
- **Automated Bank Reconciliation**: Direct API banking feeds and automated chargeback handling.
- **Biometric Identity / Government KYC**: Mandatory Aadhaar/government verification or hardware-level biometric sensors.
- **Full Payroll Calculation Engine**: Tax withholding, provident fund, insurance deductions, and direct bank salary transfers.
- **Third-Party Messaging Subscriptions**: Twilio/WhatsApp Business API subscription costs and hosting charges.
