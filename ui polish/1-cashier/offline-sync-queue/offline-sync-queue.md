# Cashier · Offline Sales Sync & Conflict Queue

## 1. Executive Summary & Page Purpose
The **Offline Sales Sync & Conflict Queue** provides full operational transparency and control over transactions created when the POS terminal loses server connectivity. It guarantees resilient store operations during outages, displays background synchronization progress, and provides manual conflict resolution tools.

## 2. Target Role & Access Control
- **Primary Role:** `CASHIER`
- **Supervisory Access:** `STORE_MANAGER`
- **Architectural Policy (OD-11):** "Online-First with Offline POS Resilient Queueing". Cashiers can continue checking out customers indefinitely during connectivity loss.

## 3. UI Drawer Architecture
```
+-----------------------------------------------------------------------+
| OFFLINE RESILIENT QUEUE                                           [✕] |
+-----------------------------------------------------------------------+
| CONNECTIVITY STATUS:                                                  |
| Status: [● SERVER RECONNECTED]  | Queue: 2 Pending | 1 Needs Review   |
+-----------------------------------------------------------------------+
| QUEUED TRANSACTION LEDGER:                                            |
| 1. INV-TEMP-001 · ₹ 1,420.00 · 3 Items · Created: 10:14 AM            |
|    Idempotency Key: 9f8a-412e-bc81                                    |
|    Status: [ Waiting in Queue ]                                       |
|                                                                       |
| 2. INV-TEMP-002 · ₹   640.00 · 1 Item  · Created: 10:18 AM            |
|    Idempotency Key: 3b12-98aa-11cf                                    |
|    Status: [ Syncing... Attempt 2 of 5 ]                              |
|                                                                       |
| 3. INV-TEMP-003 · ₹ 2,100.00 · 4 Items · Created: 10:22 AM            |
|    Status: [ ⚠️ NEEDS REVIEW - Sequence Mismatch ]                    |
|    Error Detail: "Duplicate offline reference detected on server."   |
|    Actions: [ Inspect Raw Payload ]   [ Retry Sync ]   [ Dismiss ]    |
+-----------------------------------------------------------------------+
| CONTROLS:                                                             |
| [ RESYNC ALL PENDING NOW ]                  [ EXPORT ENCRYPTED BACKUP]|
+-----------------------------------------------------------------------+
```

## 4. UI Elements & Form Controls
- **IndexedDB Storage:** Persists to `pos_offline_db` under `offline_sales` object store.
- **Top Bar Pill:**
  - Green dot: Fully synced and connected.
  - Amber dot with counter: Offline mode active; shows pending unsynced sales count.
  - Red dot: Sync conflict detected requiring cashier/manager attention.
- **Inspect Payload Modal:** Formats raw JSON order lines for technical diagnosis.
- **Manual Resync Action:** Forces immediate execution of the background worker sync loop.
