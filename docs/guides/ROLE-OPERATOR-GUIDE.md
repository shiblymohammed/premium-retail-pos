# Premium Retail POS — Beta Operator Guide

This guide describes the current beta scope. Screen actions are enforced by the API as well as the navigation. Users should only access their assigned locations and role permissions.

## Super Admin

1. Sign in using the bootstrap account configured for this environment. Change its initial password before the app is shared outside a trusted local setup.
2. Create the company and confirm currency, timezone, and invoice prefix.
3. Create the main warehouse, then any sub-warehouses and retail stores. Assign each manager only to their locations.
4. Create manager, cashier, and staff accounts. Assign location scopes and required sale-control or stock-count permissions.
5. Add product categories and catalogue entries. Check base units, carton conversion, reorder level, prices, SKU, and barcode before saving.
6. Enter opening stock using the approved base-unit quantities. These create permanent ledger records; correct errors with the supported adjustment workflow rather than editing history.
7. Set store and warehouse audit schedules and attendance target times. Review permissions, dashboard, reports, and notifications.

## Store Manager

- Confirm the active location scope in the header before using operational screens.
- Review location sales, stock, transfer queue, attendance, and replenishment requests.
- Approve or reject transfers only when authorized. A transfer requester cannot approve their own request.
- Review submitted audits, check recount requirements, and approve stock adjustments with a reason only after verifying the counts.
- Review late arrivals and correct attendance punches only with an auditable reason.
- Do not share an account or use a Super Admin account for routine store work.

## Cashier

- Sign in with the assigned cashier account and verify the store shown in the terminal.
- Scan a barcode or search for the item, review stock and discount limits, and complete the sale using the recorded payment method.
- Use invoice lookup for returns. Returns and cancellations are available only when an administrator assigned the relevant permission; refunds are recorded manually and are not initiated by the app.
- Clock in and out from Staff Attendance. Late status is based on the location's configured target time.
- If the connection drops, keep the terminal open and follow its offline-queue status. Resolve any server-side price or permission change before finalizing a queued transaction.

## Stock Counter / Auditor

- Start counts only during the configured audit window and at the authorized location.
- Enter physical quantities in the product's base unit. Expected stock stays hidden during blind counting.
- Recount items flagged by policy before submitting the audit for manager review.
- Stock stays frozen for the location after the audit starts. It changes only when an authorized manager approves reconciliation.
- Do not share count credentials or change audit thresholds; threshold changes are Super Admin controlled.

## Current exclusions

GPS/geofencing, advanced shift rules, employee loans, tax/e-invoicing, payment-gateway integration, and thermal printer hardware acceptance are not part of this beta scope. Physical-count acceptance should be scheduled with the client when they are ready.
