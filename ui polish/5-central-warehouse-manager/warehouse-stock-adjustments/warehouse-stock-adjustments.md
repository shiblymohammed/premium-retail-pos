# Central Warehouse Manager · Stock Adjustments & Damage Write-Off

## 1. Executive Summary & Page Purpose
The **Warehouse Stock Adjustments** screen is used to record shrinkage, expired stock, forklift transit damage, and repackaging carton conversions. Every adjustment requires a mandatory reason and posts as an immutable append-only ledger transaction.

## 2. Target Role & Access Control
- **Primary Role:** `CENTRAL_MANAGER`
- **Movement Types:** `DAMAGE_WRITEOFF`, `STOCK_ADJUSTMENT`.
- **Reason Tracking:** Mandatory explanation text and supervisor digital signature.
