# Central Warehouse Manager · Main Warehouse Dashboard

## 1. Executive Summary & Page Purpose
The **Main Warehouse Dashboard** provides the Central Warehouse Manager with immediate operational command over bulk master inventory, pending supplier delivery receipts, outbound store replenishment transfer requests, and dock dispatch queues.

## 2. Target Role & Access Control
- **Primary Role:** `CENTRAL_MANAGER`
- **Location Scope:** Main Central Warehouse (`MAIN_WAREHOUSE`).

## 3. UI Layout Architecture
- **Inbound Staging Queue:** Scheduled supplier shipments arriving today, awaiting dock check-in and conversion counting.
- **Outbound Dispatch Queue:** Retail store replenishment requests approved by store managers, awaiting picking, carton packing, and driver dispatch.
- **Stock Health Cards:** Bulk pallet inventory totals, damaged goods quarantined in warehouse holding bays, low bulk thresholds.
- **Quick Actions:** `[ Record Supplier Stock-In ]`, `[ Dispatch Transfer ]`, `[ Warehouse Stocktake ]`.
