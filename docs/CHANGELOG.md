# Changelog: Premium Retail POS

All notable changes to the Premium Retail POS project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
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
