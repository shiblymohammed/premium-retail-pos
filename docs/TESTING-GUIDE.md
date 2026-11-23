# Beta Setup and Verification Guide

This guide matches the current clean beta: the database is intended to contain only the environment-configured Super Admin until the client creates business records. There are no built-in cashier/manager credentials or sample catalogue records.

## Start locally (Windows PowerShell)

From the repository root:

```powershell
docker compose up -d postgres
npm run db:deploy --workspace=apps/api
npm run db:generate --workspace=apps/api
```

On a brand-new database only, create or refresh the bootstrap Super Admin from `apps/api/.env`:

```powershell
npm run db:seed --workspace=apps/api
```

> Running the seed again rotates the configured Super Admin password, revokes its existing refresh session, and does not add sample business records.

Open two PowerShell windows in the repository root:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

Open [http://localhost:3000/login](http://localhost:3000/login). The web app uses `http://localhost:4000/api/v1` by default. If using another API port, set `NEXT_PUBLIC_API_URL` before starting the web server.

## Automated checks

```powershell
npm run test --workspace=apps/api -- --runInBand
npm run test:e2e --workspace=apps/api
npm run build:api
npm run build:web
```

The unit suite is database-independent. The E2E suite requires the local PostgreSQL service and checks API liveness/readiness, unauthenticated access rejection, and request validation; it does not create or change business records.

## Runtime smoke checks

In a third PowerShell window:

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/health/liveness
Invoke-RestMethod http://localhost:4000/api/v1/health/readiness
```

Readiness should return `status: ok` and `database: connected`. Sign in through the browser and verify the dashboard shows the empty workspace state. Confirm the Super Admin can configure company and locations, create staff accounts, and manage the catalogue.

## Role and workflow UAT

Use client-approved staging or pilot records, not an uncontrolled production location. Create separate accounts for each role and limit them to the intended location scope. Do not share the Super Admin login for routine role testing.

1. **Access:** verify each role sees only its intended navigation and that direct API requests outside its role/location scope return 403. Verify an expired or signed-out token cannot access protected endpoints.
2. **Setup:** create company, main warehouse, child warehouses/stores, users, employee profiles, products, variants, and opening stock. Reconcile counts with the approved source data.
3. **Inventory:** confirm supplier receipts and stock movements change the ledger once; confirm retries with the same idempotency key do not duplicate a movement.
4. **POS:** test barcode lookup, quantities, role discount cap, successful sale, invoice lookup, and stock decrement. Test negative-stock warning only if the client accepts that policy for the pilot.
5. **Returns:** use a completed invoice. Verify permission checks, recorded reason/inspection/disposition, manual refund record, and ledger reversal/restock behavior.
6. **Transfers:** use two scoped manager accounts. Test request, approval by a different manager, dispatch, receipt, and a discrepancy. Verify in-transit stock is not available at destination before receipt.
7. **Attendance:** test clock-in/out, configured target time, late status, manager register, correction reason, and reports.
8. **Audits:** verify schedules and access in software. Physical count acceptance is deferred until requested by the client; do not use fake quantities for a real inventory location.
9. **Reports:** compare sales, stock, audit, movement, attendance, and transfer reports against source records; verify CSV/PDF scope and totals.
10. **Offline POS:** use a dedicated test account and non-production location. Queue a sale offline, restore the connection, and verify it syncs once with a unique invoice and correct stock result.

Record test date, account role, location, expected outcome, actual outcome, and any defect. Never record passwords or access tokens in test notes.

## Backups and recovery

Create a local custom-format database backup:

```powershell
npm run db:backup
```

The default output is `.backups/`, which is ignored by Git. Copy important backups to encrypted off-device storage. Verify a backup in a disposable PostgreSQL container without touching the development database:

```powershell
npm run db:restore:verify -- .backups\retail-pos-YYYY-MM-DDTHH-MM-SS-000Z.dump
```

This is a local recovery drill. Production backups must be encrypted, retained, monitored, and scheduled by the chosen hosting provider or approved operations environment.

## Notes and known boundaries

- Prisma may print a `package.json#prisma` deprecation warning under Prisma 6; it is separate from migration success.
- A successful build confirms compilation and static generation, not client UAT or every role workflow.
- GPS/geofencing, employee loans, advanced shift rules, payment-gateway integration, tax/e-invoicing, and thermal printer hardware acceptance are excluded from this beta scope.
- See [the role operator guide](guides/ROLE-OPERATOR-GUIDE.md), [the production launch checklist](PRODUCTION-LAUNCH-CHECKLIST.md), and [data templates](templates/README.md).
