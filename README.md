# Premium Retail POS

Premium Retail POS is a multi-location retail operations application for product catalogues, ledger-based inventory, warehouse transfers, checkout, stock audits, staff attendance, reports, and role/location access control.

## Stack

- Web: Next.js 15 and React 19 (`apps/web`)
- API: NestJS 11 (`apps/api`)
- Database: PostgreSQL 16 with Prisma 6
- Local database: Docker Compose

## Local setup

Requirements: Node.js 20+, npm, and Docker Desktop.

```powershell
npm install
docker compose up -d postgres
npm run db:deploy --workspace=apps/api
npm run db:generate --workspace=apps/api
```

Configure local secrets and `INITIAL_SUPER_ADMIN_EMAIL` / `INITIAL_SUPER_ADMIN_PASSWORD` in the ignored `apps/api/.env`. On a fresh database, bootstrap the only initial user:

```powershell
npm run db:seed --workspace=apps/api
```

The seed creates or refreshes only the configured Super Admin. It does not create companies, locations, products, employees, or sample role accounts. Re-running it rotates the bootstrap password and revokes existing refresh sessions.

Start each server in a separate PowerShell window from the repository root:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

Then open [http://localhost:3000/login](http://localhost:3000/login). The web app defaults to `http://localhost:4000/api/v1` for the API.

## Checks

```powershell
npm run test --workspace=apps/api -- --runInBand
npm run test:e2e --workspace=apps/api
npm run build:api
npm run build:web
```

E2E tests require the local PostgreSQL container. For the complete beta workflow, use [the testing guide](docs/TESTING-GUIDE.md).

## Data and operations

- Blank client data templates: [docs/templates](docs/templates/README.md). They are preparation sheets, not a bulk-import feature.
- Role workflows: [operator guide](docs/guides/ROLE-OPERATOR-GUIDE.md).
- Backup and isolated restore verification: `npm run db:backup` and `npm run db:restore:verify -- <backup-file>`.
- Staging and production requirements: [launch checklist](docs/PRODUCTION-LAUNCH-CHECKLIST.md).
- Current implementation status and deferred scope: [roadmap](docs/ROADMAP.md).

Never commit `.env` files, passwords, access tokens, database dumps, or production data. Replace the bootstrap password before exposing any deployment outside a trusted local environment.
