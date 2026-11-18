# Central Warehouse Manager · Outbound Transfer Dispatch

## 1. Executive Summary & Page Purpose
The **Outbound Transfer Dispatch** interface manages the picking, packing, manifesting, and physical departure of stock transfers to regional sub-warehouses and retail stores. When dispatched, it moves inventory out of `AVAILABLE` and into `IN_TRANSIT` state (`OD-05`), ensuring goods on the road cannot be sold until formally received at destination.

## 2. Target Role & Access Control
- **Primary Role:** `CENTRAL_MANAGER`
- **Invariants Enforced:** Invariant 5 (In-Transit Stock Isolation), Invariant 4 (Ledger Movements), Transfer Lifecycle.

## 3. UI Layout & Dispatch Manifest
- **Destination Selector:** Retail Store or Sub-Warehouse.
- **Picking Table:** Line items, cartons, loose units, and available warehouse balance check.
- **Vehicle & Driver Details:** Driver name, vehicle license plate, expected transit duration.
- **Dispatch Action:** Generates signed dispatch manifest with barcodes for destination scanning.
