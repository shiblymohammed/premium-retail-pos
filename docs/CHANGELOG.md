# Changelog: Premium Retail POS

All notable changes to the Premium Retail POS project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## Phase 8 — Simple staff attendance
- Added a mobile-friendly staff page to sign in, start work, and end work.
- Added authenticated, employee-linked API punches using server time and the employee’s assigned active workplace.
- Enforced one start and one end punch per workplace-local calendar day; duplicate completion is rejected.
- Added manager/admin-configurable local start times per location and a location-scoped daily attendance register.
- Saved each IN punch’s target time and late/on-time decision; managers can see the employee, actual clock-in, target, and late status.
- Added an audit event whenever a location’s attendance target is changed.
- Added optional per-location QR verification using signed location-bound tokens that rotate every 60 seconds.
- Added manager punch corrections that preserve the original timestamp, require a reason, recalculate late status, and create an audit event.
- Added location-scoped daily, weekly, and monthly summaries with CSV export.
- Deferred GPS/geofencing, full shift and grace rules, break tracking, and overtime per current client scope.

## Phase 7 — Stock audits and reconciliation
- Added location-locked physical audit sessions with a ledger snapshot of active variants.
- Added blind count entry, global/category threshold settings (default recount over 2% or over 5 base units), optional high-count alerts, and a recount queue.
- Added manager submission/review/approval and abort workflows; inventory only changes through immutable `STOCK_ADJUSTMENT` ledger movements after approval.
- Added archived audit reasons and database protection against changing or deleting resolved audit records.
- Added the authenticated manager audit workspace at `/audits`.
- Added configurable per-location scheduling in company-local time, with store and warehouse cadence rules.
- Added scheduler idempotency per local date and recorded whether an audit was scheduled.
- Applied migration `20261113000000_daily_audit_schedule` to local PostgreSQL.
- Separated manager approval reasons from threshold policy change reasons in the audit UI.
- Enforced retail-store audit availability every day only after 7:00 PM local time and warehouse audit availability on Sundays only, for both manual and scheduled starts.
- Confirmed warehouse audits also start after 7:00 PM Sundays; schedules are mandatory and default to 19:00 local time, with later start times configurable.
- Fixed local development CORS so the POS frontend on port 3001 can call the API; production continues to require explicit configured origins.
- API/web production builds pass and the full API test suite passes (39 tests across 10 suites); live scheduled-window and on-site physical-count acceptance remain.
- Decisions `OD-05` and `OD-06` confirmed: starting thresholds are over 2% or over 5 units, and counts are blind until manager review.
- Database migrations `20261112000000_audit_session_resolution_reason` and `20261112001000_audit_thresholds_and_history` were applied successfully to local PostgreSQL on 2026-11-12.

## [Unreleased]

### Added
- **Beta readiness and handover**:
  - Added a working API E2E Jest configuration covering health/readiness, unauthenticated access, and DTO validation.
  - Replaced the setup-only dashboard with role-scoped live sales, stock, transfer, replenishment, and workspace setup widgets; cashier/staff get appropriate self-service links.
  - Added blank company, location, product, opening-stock, and staff data templates plus role/operator and production launch guides.
  - Added local custom-format PostgreSQL backup and isolated restore-verification scripts; the local backup was restored successfully into a disposable PostgreSQL container.
  - Replaced stale demo-credential instructions with the current clean Super Admin-only beta setup and test guide.
- **Phase 1–2 Security Hardening**:
  - Required distinct 32-character JWT signing secrets, rejected example secrets in production, restricted JWTs to HS256, and added unique refresh-token IDs to prevent same-second token reuse.
  - Increased the minimum password length for newly created users to 12 characters and restricted sample seeding to development mode.
  - Validated role, location type, and boolean query filters instead of relying on implicit query-string coercion.
  - Added a PostgreSQL-backed, shared 15-minute login-attempt limiter using keyed hashes for IP and email identifiers; added dummy bcrypt verification for unknown accounts and rejected passwords beyond bcrypt's 72-byte limit.
  - Normalized user emails consistently on account creation and login, with database enforcement against case-variant duplicates.
- **Phase 2 Organization and Employee Management**:
  - Validated company currency, IANA timezone, invoice prefix, and GST number configuration.
  - Enforced location parent/child hierarchy, active-parent requirements, and same-company ownership.
  - Added safe user creation and updates for roles and location scopes, location-bounded administration, deactivation, and immediate rejection of tokens for inactive accounts.
  - Added employee profile API for employee codes, names, contact details, workplace assignment, reporting relationships, updates, and deactivation; included the planned Loans & Advances summary placeholder.
  - Enforced parent-scope checks when Admins create child locations, hid company/location details outside the caller's scopes, and kept employee and account deactivation state synchronized.
- **Phase 3 Product Catalogue and Unit Conversion**:
  - Added product and stock-distinct variant API management, including a designated default stock identity for products without selectable variants and case-insensitive unique SKU/barcode enforcement.
  - Required a canonical base-unit label per product, validated positive carton conversion ratios, and added conversion/formatting that refuses carton quantities when no conversion is configured.
  - Restricted product creation and all selling/purchase price changes to Super Admins; serialized concurrent price edits and recorded initial/changed prices transactionally with old/new values, actor, timestamp, and reason. Purchase prices are omitted from non-Super-Admin product responses.
- **Phase 4 Inventory Ledger Foundation**:
  - Enforced append-only inventory movements with database triggers that reject update, delete, and truncate operations; required an existing user actor and rejected zero-quantity entries.
  - Added location-scoped stock balance queries aggregated from signed ledger movements across Available, In Transit, Reserved, and Quarantined states, with mixed-unit and negative-balance formatting.
  - Added transaction-scoped stock movement writes serialized by a location row lock, with audit-freeze enforcement, negative-balance warning signals, and overflow protection.
  - Added idempotent opening-stock batches and supplier receipt confirmation for cartons and loose base units; receipt lines snapshot carton conversion, receiver identity is retained, and documents/movements commit atomically with immutable database enforcement.
  - Preserved Phase 3/4 stock meaning across catalog archival: balances include inactive product variants, and the canonical base unit cannot be changed after movements exist (enforced by the API and database).
- **Development Setup Reliability**: Fixed API TypeScript output caching so Nest watch mode recreates its entry point after cleaning the build directory; aligned the example database URL with Docker Compose defaults.
- **Core Documentation Suite**: Initialized the four foundational project architecture and operational governance files at the repository root:
  - `README.md`: System overview, functional module summary, verified repository baseline status, prerequisite guidelines, environment variable reference, and development onboarding guide.
  - `ROADMAP.md`: Phased development roadmap across 12 implementation stages, task tracker with standard priority tiers (P0–P3), comprehensive documentation of 20 critical business/technical open decisions (`OD-01` to `OD-20`), and clear definition of out-of-scope capabilities.
  - `ARCHITECTURE.md`: Technical architecture specification documenting proposed Next.js/NestJS/Prisma/PostgreSQL stack, directory layout comparison, end-to-end data flow, 12 domain module boundaries, 14 critical data integrity invariants, 8 Architectural Decision Records (ADRs), dual-axis authorization matrix, and testing strategy.
  - `CHANGELOG.md`: Initialized version tracking structure following Keep a Changelog conventions.
- **Specification Invariants Baseline**: Established formal technical documentation for key business constraints:
  - Canonical base unit inventory calculation with configurable carton conversions.
  - Append-only immutable inventory movement ledger.
  - In-transit stock segregation preventing premature destination availability.
  - Super Admin-exclusive selling and purchase price editing rights.
  - Server-side dual-axis authorization (RBAC combined with location scoping).
  - Non-destructive sales lifecycle (active bill deletion auditing and reversal-driven sale cancellations).
  - Confirmed-only employee loan balance calculations.
  - Distributed idempotency protection for mutating transactions.
- **Architectural Decisions Confirmed**: Formally incorporated stakeholder resolutions for 5 critical open decisions across `ROADMAP.md` and `ARCHITECTURE.md`:
  - `OD-01` (Carton & Loose-Packet Transfers): Permitted opening cartons and transferring loose packets between warehouses as well as between warehouses and retail stores.
  - `OD-03` (Negative Stock Policy): Adopted cashier warning alerts with negative balance display and ledger recording instead of hard checkout blocking.
  - `OD-04` (Stock Audit Concurrency): Mandated physical stock audits after store closing hours and established an active location-level movement freeze during counting sessions (ADR-010).
  - `OD-07` (Discount Limit Scope & Stacking): Implemented dual-tier enforcement applying discount caps at both line-item and bill levels, with strict prohibition of discount stacking (ADR-011).
  - `OD-11` (Operating Mode Strategy): Confirmed Online-First web architecture with local client-side offline resilient queueing (IndexedDB) and background synchronization upon network reconnection (ADR-007).
- **Phase 1 Monorepo Architecture & Bootstrap**:
  - Initialized npm workspaces monorepo: `apps/api` (NestJS 11 backend), `apps/web` (Next.js 15 frontend), and `packages/shared` (shared enums and DTO interfaces).
  - Configured `docker-compose.yml` with PostgreSQL 16 Alpine (`pos-postgres`), isolating host port `5433` to prevent collision with local database engines.
  - Authored comprehensive Prisma schema (`schema.prisma`) defining 25+ domain models covering Company, Locations, Users, Roles, Inventory, Movements, Transfers, Sales, POS items, Stock Audits, Attendance, Loans, and Audit Logs.
  - Implemented secure authentication in `@pos/api`: bcrypt password hashing, JWT access token issuance, and refresh token rotation with Passport JWT strategy.
  - Implemented server-side dual-axis authorization guards: `RolesGuard` (RBAC), `LocationScopeGuard` (Location-based tenant isolation), and `AuditLockGuard` (blocking stock mutations during active physical audits).
  - Implemented global NestJS exception filter, DTO validation pipes with strict whitelisting, and `AuditLoggingInterceptor` capturing mutating API events.
  - Configured Next.js 15 web application foundation with React 19, TypeScript, and verified zero-error end-to-end production build across all workspaces.
