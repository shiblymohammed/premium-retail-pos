# Central Warehouse Manager · Central Inventory Ledger

## 1. Executive Summary & Page Purpose
The **Central Inventory Ledger** delivers comprehensive visibility into master warehouse inventory aggregated strictly from the append-only movement ledger.

## 2. Target Role & Invariants
- **Primary Role:** `CENTRAL_MANAGER`
- **Invariants Enforced:** Invariant 4 (Ledger-Driven Balances), Invariant 1 (Base Units).

## 3. UI Features
- View stock breakdown across all 4 ledger states: `AVAILABLE`, `IN_TRANSIT`, `RESERVED`, `QUARANTINED`.
- Detailed movement transaction log with actor ID, movement type (`SUPPLIER_RECEIPT`, `TRANSFER_DISPATCH`, `DAMAGE_WRITEOFF`), and reference IDs.
