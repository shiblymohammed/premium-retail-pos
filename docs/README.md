# Project documentation

This index reflects the current beta repository and scope.

## Start here

- [Testing guide](TESTING-GUIDE.md): local setup, automated checks, runtime verification, and client-data UAT.
- [Roadmap](ROADMAP.md): implemented work, deferred scope, and outstanding deployment/acceptance items.
- [Role operator guide](guides/ROLE-OPERATOR-GUIDE.md): Super Admin, Store Manager, Cashier, and stock-count workflows.
- [Data templates](templates/README.md): blank CSV preparation templates. Bulk import is not implemented.
- [Production launch checklist](PRODUCTION-LAUNCH-CHECKLIST.md): hosting, security, backup, UAT, and go-live requirements.
- [Architecture](ARCHITECTURE.md): API boundaries, data integrity rules, and security design.
- [Changelog](CHANGELOG.md): recorded repository changes.

## Current beta boundaries

- The initial database seed creates a single environment-configured Super Admin. The client creates business records and other accounts in the application.
- GPS/geofencing, loans, advanced shift rules, payment-gateway integration, tax/e-invoicing, and printer hardware acceptance are deferred or excluded from this release.
- Client staging, production backup scheduling, physical count acceptance, and final UAT require the client’s hosting, data, and sign-off.
- Do not put real credentials, tokens, or database backups in tracked files.
