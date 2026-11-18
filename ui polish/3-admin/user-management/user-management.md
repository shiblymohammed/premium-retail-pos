# Admin · User Management & Store Assignment

## 1. Executive Summary & Page Purpose
The **User Management & Store Assignment** interface allows administrators to provision staff accounts, assign discrete operational roles (`STORE_MANAGER`, `CASHIER`, `STAFF`, `SUB_WAREHOUSE_MANAGER`), bind users to authorized physical store locations, and immediately deactivate departing personnel.

## 2. Target Role & Access Control
- **Primary Role:** `ADMIN`, `SUPER_ADMIN`
- **Security Invariant (Invariant 11):** Users must be bound to at least one valid company location. Deactivated users have their sessions revoked immediately (Section 7.1).

## 3. UI Layout & Form Architecture
```
+-----------------------------------------------------------------------+
| USER DIRECTORY & ACCESS CONTROL                                       |
+-----------------------------------------------------------------------+
| SEARCH & FILTER: [ Search by Name, Email, Employee Code ] [+ NEW USER]|
| Role Filter: [ All Roles ▼ ]  Location Filter: [ All Stores ▼ ]       |
+-----------------------------------------------------------------------+
| USERS TABLE:                                                          |
| Name / Email            Role          Assigned Locations    Status    |
| Ravi Menon              CASHIER       Downtown Store        ACTIVE    |
| r.menon@retail.com                                          [Edit]    |
|                                                                       |
| Asha Patel              STORE_MANAGER Downtown Store,       ACTIVE    |
| a.patel@retail.com                    North Mall            [Edit]    |
|                                                                       |
| Vikram Singh            CASHIER       West End Outlet       INACTIVE  |
| v.singh@retail.com                                          [Reactivate]
+-----------------------------------------------------------------------+
| CREATE / EDIT USER MODAL:                                             |
| * Full Name:         [                                              ] |
| * Email Address:     [                                              ] |
| * Temporary Password:[                                              ] |
| * Role Selection:    [ CASHIER ▼ ]                                    |
| * Permitted Stores:  [✓] Downtown Store  [✓] North Mall  [ ] West End |
| * Employee Code:     [ EMP-0842                                     ] |
|                                                                       |
| [ CANCEL ]                                          [ SAVE USER & PERMS ]
+-----------------------------------------------------------------------+
```

## 4. UI Fields & Validation
- **Email Validation:** RFC 5322 regex validation; unique index check.
- **Password Constraints:** Minimum 8 characters, bcrypt hashed with salt rounds 12.
- **Location Binding Checkboxes:** Ensures dual-axis authorization is configured prior to user activation.
