# Page Specification: Enterprise Reports & Export Center (`/reports`)

## 1. What is this Page?
The **Enterprise Reports & Export Center** is the central data intelligence hub for the retail business. It provides real-time operational notifications, 9 comprehensive analytical and audit reports, multi-store filtering, and client-side high-precision **PDF and CSV document export engines**.

---

## 2. In-App Operational Notification Center

### Bell Icon & Notification Drawer
- **Unread Count Pill:** Displays total unread operational alerts in the navigation bar.
- **Trigger Conditions:** Automatically generates alerts for:
  - Low stock warnings (items hitting reorder levels).
  - Negative inventory balances requiring reconciliation (`OD-03`).
  - Inter-store transfer shipment discrepancies.
  - Active stock audit freezes.
- **Drawer Controls:**
  - Lists notification cards with title, detailed message, time ago, and direct shortcut link (`href`).
  - Single-click `Mark all as read` action.

---

## 3. Date Range & Location Scoping Filters

### Location Filter Dropdown
- Filters data by `All Locations`, specific retail stores, or warehouses.
- Strictly obeys dual-axis access controls (managers only see locations within their assigned tenant boundary).

### Date Range Inputs (`From` / `To`)
- ISO calendar date pickers defaulting to the last 30 days (`Today - 30 days` to `Today`).

---

## 4. The 9 Core Report Modules

Users select from a dropdown of 9 specialized reports:

### 1. Sales Summary & Turnover (`sales`)
- **What it shows:** Net revenue, total finalized invoices, and total cancelled invoices.
- **Visuals:** Location-by-location revenue breakdown table, plus day-by-day daily sales timeline.

### 2. Itemized Sales Details (`salesDetails`)
- **What it shows:** Paginated invoice-by-invoice transaction ledger with invoice number, store branch, timestamp, payment status, and net total.

### 3. Stock Ledger Balances (`stock`)
- **What it shows:** Real-time unit counts for every SKU across the 4 canonical states: Available, In-Transit (`OD-05`), Reserved, and Quarantined.
- **Conversion Feature:** Shows carton-to-packet breakdown (`OD-02`).

### 4. Low Stock Alerts (`lowStock`)
- **What it shows:** Filtered inventory report showing only variants at or below reorder levels, highlighting urgent reorder quantities.

### 5. Transfer Discrepancies (`transferDiscrepancies`)
- **What it shows:** Dispatched shipments where received good units differed from dispatch manifests, tracking damaged goods sent to quarantine.

### 6. Audit Variances (`auditVariances`)
- **What it shows:** Discrepancy logs from physical stocktakes, showing expected vs counted units, percentage shrinkage, and manager approval notes.

### 7. Price Change Audit Trail (`priceChanges`)
- **What it shows:** Historical log of master price alterations (`Invariant 10`). Details product SKU, actor ID, old purchase price, new purchase price, old selling price, new selling price, timestamp, and mandatory change reason.

### 8. Invoice Cancellations & Voids (`cancellations`)
- **What it shows:** Complete log of voided invoices (`OD-08`). Shows voided invoice number, store, supervisor who authorized the cancellation, refund amount, and mandatory cancellation reason.

### 9. Cashier Line Item Deletions (`itemDeletions`)
- **What it shows:** Security audit log tracking items that cashiers scanned into an active POS cart and subsequently deleted before checkout. Used to detect cashier shrinkage or cart tampering.

---

## 5. Dual Export Engines (PDF & CSV)

### 1. Vector PDF Export Engine (`downloadPdf`)
- **How it works:** Generates native, clean, vector PDF documents directly in the client browser without external server load.
- **Formatting:** Formatted with corporate headers (*PREMIUM RETAIL - REPORT TITLE*), date range metadata, page numbers (*Page X of Y*), and auto-wrapped field rows.
- **Security:** Strips unsupported unicode to guarantee clean cross-platform rendering across thermal or desktop laser printers.

### 2. Formatted CSV Export Engine
- Generates clean RFC 4180 compliant CSV files with escaped quotes.
- Automatically sets download filename: `[report-type]-[startDate]-to-[endDate].csv`.
