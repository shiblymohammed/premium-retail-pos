# Production Launch Checklist

Use this checklist with the client before enabling a production URL. Local build success is not a substitute for staging UAT or backup recovery verification.

## Local preflight — 23 Nov 2026

These checks cover the current development workspace only. They do not count as staging or production sign-off.

- [x] API production build completed successfully (`npm run build:api`).
- [x] Web production build completed successfully (`npm run build:web` with an isolated Next build directory).
- [x] Local PostgreSQL container reported healthy.
- [x] Local database migration status is up to date (30 migrations found, none pending).
- [x] Select Vercel for the temporary web frontend domain (`*.vercel.app`).
- [ ] Select and provision a persistent API host and managed PostgreSQL for staging.

The checked items above are local preflight evidence; all staging and production items below remain independently required.

## Environment and access
u
- [ ] Record the generated Vercel web URL, API host, database provider, and support owner.
- [ ] Set production secrets in the provider's secret manager; never copy local `.env` files to Git or client devices.
- [ ] Replace the bootstrap Super Admin password with a unique, high-entropy secret; verify password rotation and recovery ownership.
- [ ] Set `NODE_ENV=production`, explicit `CORS_ORIGIN`, secure database credentials, and production API/web URLs.
- [ ] Enable HTTPS and verify proxy / forwarded-IP configuration before relying on IP rate limits.
- [ ] Confirm the Super Admin account is active and no demo accounts, sample records, or test credentials are present.

## Database and recovery

- [ ] Apply migrations to staging, review migration output, then deploy the same migration set to production.
- [ ] Configure provider-managed encrypted automated backups with a documented retention period and owner.
- [ ] Copy a backup to an independent storage location; verify access controls and retention.
- [ ] Run `npm run db:backup` and `npm run db:restore:verify -- <backup-file>` on a representative staging database.
- [ ] Record restore duration, row/table checks, recovery point, and recovery time; approve the recovery plan with the client.

## Client data and workflows

- [ ] Confirm company currency/timezone/invoice prefix and the complete location hierarchy.
- [ ] Import/enter real catalogue and opening stock through the approved process; reconcile source totals.
- [ ] Create scoped manager, warehouse, cashier, and staff accounts; verify each role in staging.
- [ ] Verify sales, discount rejection, invoice lookup, permitted return/cancellation, and manual refund recording.
- [ ] Verify transfer approval, dispatch, receipt, discrepancies, and replenishment.
- [ ] Verify attendance target/late reporting and audit schedules with client-approved test data.
- [ ] Complete reports, CSV/PDF exports, and notification review with representative records.
- [ ] Obtain client sign-off for workflows in scope. Record excluded hardware and features separately.

## Operations

- [ ] Verify health readiness, application logs, error alerts, rate limits, CORS, and database connectivity.
- [ ] Assign backup, restore, account recovery, incident response, and client support owners.
- [ ] Train role-specific operators using `docs/guides/ROLE-OPERATOR-GUIDE.md`.
- [ ] Approve go-live window, rollback procedure, and support/bug-fix period with the client.

Do not mark this checklist complete until the staging environment and client UAT are actually completed.
