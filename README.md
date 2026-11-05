# Premium Retail POS

> Developer-oriented entrance and operational guide for the Premium Retail Point of Sale and Inventory Management System.

---

## 1. Project Overview

**Premium Retail POS** is an enterprise-grade multi-location retail management system designed to govern end-to-end retail operations across a main warehouse, regional sub-warehouses, and retail store outlets. 

The system provides unified control over multi-variant product catalogues, configurable carton-to-packet inventory conversions, ledger-backed stock movements, inter-location replenishment and transfers, point-of-sale (POS) billing with fraud prevention safeguards, weekly physical stock count audits with recount approvals, mobile employee attendance verification (QR/geofence), and employee loan/advance tracking.

### Primary Business Purpose & Target Operating Environment
- **Operational Discipline & Fraud Prevention**: Eliminates untracked inventory shrinkage, unauthorized discounting, silent price tampering, and ghost stock modifications via strict backend-enforced dual-axis permissions (role-based and location-scoped) and append-only audit ledgers.
- **Supply Chain Traceability**: Manages complex inventory lifecycles across tiered distribution nodes (Company &rarr; Main Warehouse &rarr; Sub-Warehouses &rarr; Retail Outlets).
- **Target Environment**: Multi-terminal desktop, tablet, and mobile browsers operating across warehouse loading docks, stockrooms, and high-frequency retail checkout counters.

---

## 2. Feature Overview

The core business capabilities consolidated from the functional specification comprise twelve major subsystems:

1. **Identity & Access Management**: Secure authentication, role assignments (Super Admin, Admin, Central Manager, Sub-Warehouse Manager, Store Manager, Cashier, Staff), and strict backend location scoping.
2. **Organization & Location Hierarchy**: Tiered location modeling (Main Warehouse, Sub-Warehouses, Retail Stores) with manager oversight and isolated stock boundaries.
3. **Product Catalogue & Variants**: Management of products, stock-distinct variants (size, colour, style), barcodes/SKUs, and Super Admin-restricted pricing controls.
4. **Units of Measure & Conversions**: Configurable canonical base units (e.g., packets) with dynamic carton-to-packet conversion handling alongside native packet-only items.
5. **Inventory Movement Ledger**: Immutable, append-only stock movement ledger tracking all transitions (receipts, sales, transfers, returns, adjustments) across four stock states (`Available`, `In transit`, `Reserved`, `Quarantined`).
6. **Supplier Receiving**: Verified supplier stock-in recording cartons and loose packets, tied to movement logs with discrepancy reporting.
7. **Replenishment & Warehouse Transfers**: Automated reorder level draft suggestions, loose-packet & carton transfers across warehouses (`OD-01`), multi-step transfer lifecycles (Draft &rarr; Pending &rarr; Approved &rarr; Dispatched-In Transit &rarr; Received), and in-transit stock isolation.
8. **POS Billing & Sales Controls**: High-speed cashier checkout, dual-tier line & bill discount approvals (`OD-07`), negative stock warning alerts with negative balance recording (`OD-03`), auditable active-cart item removals, non-destructive sale cancellation/reversals, and offline resilient queueing with auto-sync upon reconnection (`OD-11`).
9. **Weekly Stock Audit & Recount**: Dedicated after-hours physical counts with location-level movement freeze during counting (`OD-04`), configurable discrepancy thresholds, manager recount workflow, and adjustment authorization.
10. **Staff Mobile Attendance**: Mobile punch-in/out backed by rotating workplace QR codes and GPS geofence verification, with auditable manager correction workflows.
11. **Employee Loans & Advances**: Disbursal tracking, structured repayments, balance calculations, and pending payroll deduction synchronization.
12. **Reporting, Dashboards & Audit**: Real-time sales summaries, stock reconciliation ledgers, discrepancy tracking, and comprehensive audit trail logging.

---

## 3. Actual Technology Stack

> [!NOTE]
> **Repository Baseline Status: Phase 1 Monorepo Scaffolding Complete**
> The monorepo workspace has been initialized with the NestJS backend API (`apps/api`), Next.js frontend (`apps/web`), shared types package (`packages/shared`), comprehensive Prisma ORM schema, and Docker Compose PostgreSQL configuration.

### Verified Technology in Repository
- **Monorepo Architecture**: npm workspaces (`apps/*`, `packages/*`)
- **Backend Framework**: NestJS 11 + TypeScript (`apps/api`), Passport JWT, bcrypt password hashing
- **Frontend Framework**: Next.js 15 + React 19 (`apps/web`)
- **Database & ORM**: PostgreSQL with Prisma ORM v6 (`schema.prisma` with 25+ domain models)
- **Shared Library**: `@pos/shared` (common enums, interfaces, DTO definitions)

### Proposed Technology Stack (Pending Architecture Confirmation)
As documented in the requirements specification (Section 21), the proposed technology alignment is:
- **Frontend Framework**: React / Next.js (TypeScript)
- **Backend Framework**: NestJS (TypeScript, Modular Architecture)
- **Database & ORM**: PostgreSQL with Prisma ORM
- **Styling**: Vanilla CSS / Component-level styling (Tailwind CSS subject to architectural confirmation)
- **API Protocol**: RESTful JSON API with structured DTO validation and OpenAPI/Swagger documentation
- **Mobile/Offline Strategy**: Online-First architecture with local client-side offline resilient queueing (IndexedDB) and background synchronization upon reconnection (Confirmed `OD-11`)

---

## 4. Prerequisites

Once the development environment is initialized around the proposed stack, the following runtimes and tools will be required:

| Component | Proposed Requirement | Verification Method |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.x LTS` | `node -v` |
| **Package Manager** | `pnpm` (`>= 9.x`) or `npm` (`>= 10.x`) | `pnpm -v` / `npm -v` |
| **Database** | PostgreSQL `>= 15.x` | `psql --version` |
| **Git** | `>= 2.x` | `git --version` |

*(Official versions will be updated once `.nvmrc`, `package.json`, and Docker configurations are established.)*

---

## 5. Quick Start (Initialization Guide)

Because the project is currently in the architectural inception phase without committed build scripts, the following represents the roadmap initialization path for setting up the proposed stack:

### Step 1: Bootstrap Project Foundation
*(To be executed once monorepo / directory structure is confirmed)*
```bash
# Clone the repository and navigate to root
cd POS

# Initialize version control (if not already present)
git init
```

### Step 2: Environment Configuration
Copy the forthcoming environment template to your local environment file:
```bash
# Proposed workflow
cp .env.example .env
```
Configure your local PostgreSQL connection string and cryptographic secrets (see [Environment Variables](#6-environment-variables)).

### Step 3: Install Dependencies
```bash
# Once package.json is committed
npm install
# or
pnpm install
```

### Step 4: Database Setup & Migrations
```bash
# Proposed Prisma workflow
npx prisma migrate dev --name init
npx prisma db seed
```

### Step 5: Start Development Servers
```bash
# Proposed development scripts
npm run dev
```

### Step 6: Testing & Quality Gates
```bash
# Proposed test scripts
npm run test        # Unit tests
npm run test:e2e    # End-to-end integration tests
npm run lint        # Code style and type checking
```

---

## 6. Environment Variables

Below is the documented specification of required environment variables to be configured in `.env` once the application backend is provisioned. **Never commit secrets, API keys, or raw database credentials into version control.**

| Variable Name | Purpose | Example / Format | Required In |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Runtime environment mode | `development` \| `staging` \| `production` | All |
| `PORT` | API server HTTP port | `4000` | Backend |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:password@localhost:5432/retail_pos?schema=public` | Backend |
| `JWT_SECRET` | Signing secret for authentication tokens | Secure 256-bit entropy string | Backend |
| `JWT_EXPIRES_IN` | Token expiration duration | `8h` or `1d` | Backend |
| `CORS_ORIGIN` | Permitted frontend origins | `http://localhost:3000` | Backend |
| `QR_SIGNING_SECRET`| Salt for rotating workplace attendance QR codes | Secure entropy string | Backend |
| `NEXT_PUBLIC_API_URL`| Base URL for backend REST API | `http://localhost:4000/api/v1` | Frontend |

---

## 7. Project Structure

The current repository layout and the proposed target directory layout are structured as follows:

### Current Repository Layout
```text
POS/
├── docs/                      # Project documentation
│   ├── ARCHITECTURE.md        # System design, data integrity invariants, and ADRs
│   ├── CHANGELOG.md           # Chronological record of codebase changes
│   ├── ROADMAP.md             # Implementation phases, task tracker, and open decisions
│   └── TESTING-GUIDE.md       # Step-by-step manual testing guide
├── scripts/                   # Utility scripts
│   └── generate-secrets.js    # Cryptographic secret generator
├── README.md                  # Project entrance, setup, and overview (this file)
├── docker-compose.yml         # PostgreSQL development environment
└── .env.example               # Environment configuration template
```

### Proposed Target Project Structure
```text
POS/
├── docs/                      # Project documentation
│   ├── ARCHITECTURE.md        # System design and technical specifications
│   ├── ROADMAP.md             # Development phases and task tracking
│   ├── CHANGELOG.md           # Version history
│   └── TESTING-GUIDE.md       # Step-by-step manual testing guide
├── scripts/                   # Utility scripts
│   └── generate-secrets.js    # Secret key generator
├── apps/
│   ├── web/                   # Next.js / React POS & Backoffice Frontend
│   │   ├── src/
│   │   │   ├── app/           # App router pages
│   │   │   ├── components/    # Reusable UI design system
│   │   │   └── lib/           # API client and offline synchronization
│   └── api/                   # NestJS Backend API
│       ├── src/
│       │   ├── modules/       # Domain modules (Auth, Company, Location, Users, etc.)
│       │   ├── common/        # Guards, interceptors, filters, decorators
│       │   └── prisma/        # Prisma schema, migrations, seed data
├── packages/
│   └── shared/                # Shared TypeScript types and DTOs
├── .env.example               # Template environment configuration
├── docker-compose.yml         # PostgreSQL development environment
└── package.json               # Root workspace configuration
```

---

## 8. Development Notes & Core Documentation Links

All developers, technical contributors, and reviewers must familiarize themselves with the core project documents before submitting code changes:

- **[ROADMAP.md](docs/ROADMAP.md)**: Tracks implementation progress across all 12 delivery phases, priority tasks (P0–P3), and the 20 critical Open Decisions (`OD-01` to `OD-20`).
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)**: Details the 14 non-negotiable data integrity invariants, domain module boundaries, dual-axis permission model, and Architectural Decision Records (ADRs).
- **[CHANGELOG.md](docs/CHANGELOG.md)**: Maintained in Keep a Changelog format; tracks all functional changes, security enhancements, and version releases.
- **[TESTING-GUIDE.md](docs/TESTING-GUIDE.md)**: Step-by-step testing manual covering health checks, auth, company, location, and permission verification.
#   p r e m i u m - r e t a i l - p o s  
 