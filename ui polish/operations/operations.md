# Page Specification: Operations & API Test Bench (`/operations`)

## 1. What is this Page?
The **Operations & API Test Bench** is a built-in technical console used by developers, QA testers, and technical administrators. It allows direct, interactive execution of all platform backend endpoints across Roadmap Phases 1 through 6 without requiring external tools like Postman.

---

## 2. Preset Workflow Selector

- **What is it?** A dropdown menu pre-populated with ready-to-run API requests covering every phase of the project:
  - **Phase 1 · Foundation:**
    - `API liveness`: GET `/health/liveness` (Confirms backend process is alive)
    - `Database readiness`: GET `/health/readiness` (Verifies PostgreSQL connection)
    - `Sign in`: POST `/auth/login` (Authenticates Super Admin and returns JWT)
    - `Refresh session`: POST `/auth/refresh` (Rotates JWT refresh tokens)
  - **Phase 2 · Organization:**
    - `List companies`: GET `/companies`
    - `Create company`: POST `/companies` (Sets currency, timezone, invoice prefix)
    - `Company statistics`: GET `/companies/:id/statistics`
    - `List locations`: GET `/locations` (Main WH, Sub WH, Retail Stores)
    - `Create location`: POST `/locations` (Creates location node with hierarchy)
  - **Phase 3 · Product Catalogue:**
    - `List products`: GET `/products`
    - `Create product`: POST `/products` (Sets canonical base unit and carton ratio)
    - `Update product prices`: PATCH `/products/:id/prices` (Super Admin exclusive price alteration with PriceChangeLog)
  - **Phase 4 · Inventory Ledger:**
    - `Get balances`: GET `/inventory/balances` (Aggregated ledger stock balances)
    - `Record movement`: POST `/inventory/movements` (Append-only stock transaction)
  - **Phase 5 · Transfers:**
    - `Create transfer`: POST `/transfers` (Draft replenishment between locations)
    - `Dispatch transfer`: POST `/transfers/:id/dispatch` (Moves stock into IN_TRANSIT)
    - `Receive transfer`: POST `/transfers/:id/receive` (Clears transit to available/quarantine)
  - **Phase 6 · Point of Sale:**
    - `Create sale`: POST `/sales` (POS checkout with line items, tender, and idempotency)
    - `Get invoice`: GET `/sales/invoices/:number`
    - `Cancel sale`: POST `/sales/invoices/:number/cancel` (Reasoned void and reversal)
    - `Process return`: POST `/sales/invoices/:number/returns` (Item return and refund)

---

## 3. Interactive Request Builder Panel

- **HTTP Method Selector:** `GET`, `POST`, `PATCH`, `DELETE`.
- **API Endpoint URL Field:** Live editable URL path (e.g. `/api/v1/sales`).
- **Auth Token Toggle:** Checkbox to automatically inject the active session's Bearer JWT into the `Authorization` header.
- **Request Body Editor:** Syntax-highlighted JSON editor pre-filled with sample payloads for the selected preset.

---

## 4. Response & Console Viewer Panel

- **Status Code Badge:** Green `200 OK` / `201 Created`, or Red `400 Bad Request` / `403 Forbidden` / `500 Error`.
- **Latency Timer:** Roundtrip execution time in milliseconds (e.g. `42ms`).
- **Response Headers & JSON Body:** Formatted, expandable JSON response payload showing returned database entities and error messages.
