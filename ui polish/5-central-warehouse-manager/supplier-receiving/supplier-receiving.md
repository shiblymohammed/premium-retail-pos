# Central Warehouse Manager · Supplier Inward Receiving

## 1. Executive Summary & Page Purpose
The **Supplier Inward Receiving** screen records goods received directly from external vendors and distributors. It enforces Invariant 1 (`Canonical Base Units`) and Invariant 2 (`Carton Conversions`), converting bulk cartons into base units, snapshotting line conversion ratios, and atomically posting `SUPPLIER_RECEIPT` movements to the ledger.

## 2. Target Role & Access Control
- **Primary Role:** `CENTRAL_MANAGER`
- **Location Scope:** Main Central Warehouse (`MAIN_WAREHOUSE`).
- **Invariants Enforced:** Invariant 1 (Base Units), Invariant 2 (Carton Conversions), Invariant 4 (Ledger Movements), Section 4 (Module 5: Supplier Receiving).

## 3. UI Layout & Receiving Form
```
+-----------------------------------------------------------------------+
| SUPPLIER INWARD GOODS RECEIPT                                         |
+-----------------------------------------------------------------------+
| SHIPMENT METADATA:                                                    |
| Supplier / Vendor:   [ Tata Global Beverages Limited                ▼]|
| Supplier Invoice No: [ INV-TATA-2026-9814                           ] |
| Delivery Challan No: [ DC-88124                                     ] |
| Received At Dock:    [ Dock Bay #03 - Main Central Warehouse       ] |
| Date & Time:         12-Nov-2026 11:30 AM (Auto Timestamp)            |
+-----------------------------------------------------------------------+
| LINE ITEMS RECEIVED TABLE:                                            |
| Product / Variant     Cartons Received  Loose Units  Base Qty Computed|
| Arabica Ground Coffee [ 50 ] cartons    [ 0 ] packs  = 600 base packs |
| (Ratio: 1 ctn = 12 pk)| Batch No: [ B-941 ]  Expiry: [ 30-Nov-2027 ]  |
|                                                                       |
| Almond Oat Drink 1L   [ 20 ] cartons    [ 4 ] bottles= 124 base bt    |
| (Ratio: 1 ctn = 6 bt) | Batch No: [ B-102 ]  Expiry: [ 15-Jun-2027 ]  |
+-----------------------------------------------------------------------+
| TOTAL INWARD SUMMARY:                                                 |
| Total Cartons: 70 cartons | Total Base Units Added to Ledger: 724     |
+-----------------------------------------------------------------------+
| [ SAVE DRAFT RECEIPT ]                    [ CONFIRM RECEIPT & POST DB ]|
+-----------------------------------------------------------------------+
```

## 4. Business Logic & Invariants
1. **Conversion Snapshotting (Invariant 14):** The active carton conversion ratio at the time of receipt is permanently recorded in the receipt line.
2. **Immutable Receipts (Invariant 8):** Once submitted, the receipt cannot be deleted; errors require a formal stock adjustment with reason logging.
