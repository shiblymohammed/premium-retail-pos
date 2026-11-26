# Temporary Vercel Web Deployment

The intended temporary public URL is a Vercel `*.vercel.app` domain. Deploy the Next.js web app on Vercel and keep the NestJS API plus its audit reminder scheduler on a persistent Node service. Use managed PostgreSQL for staging and production; do not point a public Vercel build at the local Docker database.

## Vercel project settings

Create a Vercel project from the repository with:

- Framework preset: Next.js (auto-detected).
- Root directory: `apps/web`.
- Install command: `npm install` (Vercel should resolve the repository-root npm workspace and `package-lock.json`).
- Build command: `npm run build`.
- Output directory: leave the Next.js default.
- Node.js version: 20 or newer.

After the first deploy, record the generated `https://<project>.vercel.app` URL. Do not use preview URLs as the production origin for client acceptance.

## Required environment configuration

Set these in Vercel Project Settings → Environment Variables, for the Production environment:

- `NEXT_PUBLIC_API_URL`: the HTTPS API base URL ending in `/api/v1`, for example `https://api.example-host.com/api/v1`.

Set these on the API host using its secret manager:

- `NODE_ENV=production`
- `PORT`: supplied by the API host, if applicable.
- `DATABASE_URL`: managed PostgreSQL connection URL with TLS and production credentials.
- `CORS_ORIGIN`: the exact Vercel production origin, e.g. `https://<project>.vercel.app` (no trailing slash).
- `JWT_SECRET` and `JWT_REFRESH_SECRET`: unique high-entropy production secrets; never reuse local development values.
- For the one-time Super Admin seed only, `INITIAL_SUPER_ADMIN_EMAIL` and `INITIAL_SUPER_ADMIN_PASSWORD`: set as protected API-host secrets, run the seed once against the intended database, then remove the seed credentials from the runtime environment and rotate the password through the app.

Never put API secrets or database credentials in `NEXT_PUBLIC_*` variables. They are exposed to browser code.

## API and database requirements

The API needs a persistent process. `AuditScheduler` starts a one-minute in-process timer when the NestJS application boots, so deploying the API as an invocation-only/sleeping function can miss audit-due notifications. Configure the API host to run:

```text
Build: npm ci && npm run db:generate --workspace=apps/api && npm run build:api
Start: npm run start:prod --workspace=apps/api
```

Provision PostgreSQL separately. Before importing client data, deploy migrations against the staging database with:

```text
npm run db:deploy --workspace=apps/api
```

Apply the checked-in migrations to the target database before releasing the upgraded API. Use `/api/v1/health/readiness` as the API traffic gate. It checks access to the required stock ledger schema and returns HTTP 503 if the check fails. Verify stock posting and the transfer report on a staging fixture before promotion. Configure the API host's shared gateway rate limits if running multiple API instances; the app's built-in broad request limiter is process-local.

## Readiness status

- Vercel CLI is available locally, but there is no authenticated Vercel account in this workspace yet.
- The Vercel project and generated temporary domain have not been created.
- No public deployment has been made.
- A persistent API host and managed PostgreSQL provider still need provisioning before the frontend can use real data.
- Staging migration, backup/restore verification, account setup, and client UAT remain launch gates in `PRODUCTION-LAUNCH-CHECKLIST.md`.
