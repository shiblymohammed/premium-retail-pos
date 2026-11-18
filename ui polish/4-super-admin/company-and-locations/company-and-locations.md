# Super Admin · Company Settings & Location Hierarchy

## 1. Executive Summary & Page Purpose
The **Company Settings & Location Hierarchy** interface is the foundational governance screen for the entire retail enterprise. Super Admins configure tenant corporate profiles, base currency, store timezones, globally unique invoice numbering prefixes, and establish the three-tier physical location hierarchy.

## 2. Target Role & Access Control
- **Exclusive Role:** `SUPER_ADMIN` Only
- **Invariants Enforced:** Invariant 11 (Dual-Axis RBAC), Section 4 (Module 2: Organization & Locations).

## 3. UI Layout & Form Architecture
```
+-----------------------------------------------------------------------+
| ENTERPRISE CONFIGURATION & LOCATION TOPOLOGY                          |
+-----------------------------------------------------------------------+
| COMPANY PROFILE:                                                      |
| Company Name:          [ Demo Retail Group Private Limited          ] |
| Operating Currency:    [ INR - Indian Rupee (₹)                    ▼] |
| Base Timezone:         [ Asia/Kolkata (UTC +05:30)                 ▼] |
| Global Invoice Prefix: [ DEMO ] (Must be unique across all companies) |
| [ SAVE COMPANY SETTINGS ]                                             |
+-----------------------------------------------------------------------+
| PHYSICAL LOCATION HIERARCHY TREE:                                     |
| [ + CREATE NEW NODE ]                                                 |
|                                                                       |
| 🏢 Main Central Warehouse (Code: WH-MAIN-01)                          |
|    ├── 🏬 Sub-Warehouse North Region (Code: WH-SUB-01)                |
|    │     └── 🏪 North Mall Retail Store (Code: STR-NM-02)             |
|    │           Terminal Lanes: POS-T01, POS-T02                       |
|    ├── 🏪 Downtown Flagship Store (Code: STR-DT-01)                   |
|    │     Terminal Lanes: POS-T01, POS-T02, POS-T03                    |
|    └── 🏪 West End Outlet (Code: STR-WE-03)                           |
|          Terminal Lanes: POS-T01                                      |
+-----------------------------------------------------------------------+
| NODE MANAGEMENT DRAWER (Selected: Downtown Flagship Store):           |
| Location Name:     [ Downtown Flagship Store                        ] |
| Location Type:     [ RETAIL_STORE ▼ ] (MAIN_WH / SUB_WH / STORE)      |
| Parent Node:       [ Main Central Warehouse ▼ ]                       |
| GPS Coordinates:   Latitude: [ 12.9716 ]  Longitude: [ 77.5946 ]       |
| Geofence Radius:   [ 50 ] meters (OD-12)                              |
| Assigned Manager:  [ Asha Patel (STORE_MANAGER) ▼ ]                   |
| Status:            [ ACTIVE ]  (Hard deletion prohibited by history)  |
| [ SAVE LOCATION DETAILS ]                                             |
+-----------------------------------------------------------------------+
```

## 4. Business Invariants & Safeguards
1. **Invoice Prefix Uniqueness (Phase 2):** Prefix must be globally unique across all tenant companies to prevent collision on the global invoice number index.
2. **No Hard Deletion (Invariant 8):** Active location nodes with historical sales or stock movements can never be deleted; they may only be marked `INACTIVE`.
