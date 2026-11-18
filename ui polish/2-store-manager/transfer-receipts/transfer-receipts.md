# Store Manager · Inbound Transfer Receipt & Quarantine

## 1. Executive Summary & Page Purpose
The **Inbound Transfer Receipt & Quarantine** screen manages the arrival of inter-location replenishment transfers from the central warehouse. In compliance with Invariant 5 (`In-Transit Stock Isolation`), arriving stock remains unavailable for retail sale until the store manager formally verifies quantities, quarantines any damaged goods, and submits receipt confirmation.

## 2. Target Role & Access Control
- **Primary Role:** `STORE_MANAGER`
- **Location Scope:** Destination Retail Store (`transfer.destinationLocationId`).
- **Invariants Enforced:** Invariant 5 (In-Transit Stock Isolation), Invariant 4 (Ledger-Driven Movements), Transfer Lifecycle State Machine.

## 3. UI Layout & Verification Table
```
+-----------------------------------------------------------------------+
| INBOUND TRANSFER SHIPMENT RECEIPT                                     |
+-----------------------------------------------------------------------+
| Manifest ID: TR-2026-0314      Origin: Central Warehouse              |
| Dispatched At: 11-Nov 04:30 PM  Carrier: Express Logistics             |
| Status: IN TRANSIT              Expected Units: 72 base units         |
+-----------------------------------------------------------------------+
| LINE ITEM RECEIPT AUDIT TABLE:                                        |
| Item Name             SKU      Dispatched  Received Good  Damaged/Qur |
| Arabica Ground Coffee BEV-1048 48 packs    [ 48 ] packs   [  0 ] packs|
| Almond Oat Drink 1L   BEV-1081 24 bottles  [ 20 ] bottles [  4 ] bottl|
|                                                                       |
| Damaged Goods Notes:                                                  |
| [ Almond Oat Drink: 4 bottles leaked during transit in carton #2.    ]|
+-----------------------------------------------------------------------+
| RECONCILIATION SUMMARY:                                               |
| • Total Dispatched: 72 base units                                     |
| • Good Units Accepted to Store AVAILABLE: 68 units                    |
| • Damaged Units Accepted to Store QUARANTINED: 4 units                |
+-----------------------------------------------------------------------+
| [ SAVE DRAFT ]                          [ CONFIRM RECEIPT & POST LEDGER]|
+-----------------------------------------------------------------------+
```

## 4. Business Logic & Ledger Execution
- **Atomic Balance Updates:**
  - Decrements Source `IN_TRANSIT` by full 72 units.
  - Increments Destination `AVAILABLE` by 68 good units.
  - Increments Destination `QUARANTINED` by 4 damaged units.
- **Status Transition:** Transfer status moves from `DISPATCHED` to `RECEIVED` (or `PARTIALLY_RECEIVED`).
