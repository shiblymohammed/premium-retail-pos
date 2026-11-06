# Manual Testing Guide — Sprint 01

> Step-by-step guide to manually test the Premium Retail POS system from scratch.

---

## 🎯 Testing Objectives

By the end of this guide, you will have verified:
- ✅ Environment setup is correct
- ✅ Database migrations work
- ✅ Seed data populates correctly
- ✅ API server starts without errors
- ✅ Authentication works (login, JWT tokens)
- ✅ Authorization guards work (role-based access)
- ✅ Company module endpoints function
- ✅ Location module endpoints function
- ✅ Location hierarchy validation works
- ✅ Dual-axis authorization (RBAC + Location Scope) works

---

## 📋 Prerequisites

Before starting, ensure you have:
- [ ] Node.js >= 20.x installed
- [ ] Docker Desktop installed and running
- [ ] Git installed
- [ ] A REST client (Postman, Thunder Client, or curl)
- [ ] Code editor (VS Code recommended)

---

## Phase 1: Environment Setup (20 minutes)

### Step 1.1: Generate Secrets

```bash
# Navigate to project root
cd c:\Users\shibi\Documents\dev\POS

# Generate secure secrets
node scripts\generate-secrets.js
```

**Expected Output:**
```
╔════════════════════════════════════════════════════════════════╗
║        Premium Retail POS — Secret Key Generator              ║
╚════════════════════════════════════════════════════════════════╝

Copy these values to your .env files:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

JWT_SECRET=<random-base64-string>
JWT_REFRESH_SECRET=<random-base64-string>
QR_SIGNING_SECRET=<random-hex-string>
SESSION_SECRET=<random-hex-string>
```

**✅ Verification:**
- Script runs without errors
- Four different secrets generated
- Each secret is long and random

**❌ Troubleshooting:**
- If script fails: Check Node.js version with `node -v`
- Should be 20.x or higher

---

### Step 1.2: Configure Environment Files

```bash
# Copy environment templates
copy .env.example .env
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env.local
```

**Edit `apps\api\.env`** with the generated secrets:

```env
NODE_ENV=development
PORT=4000
HOST=0.0.0.0

# Use Docker PostgreSQL connection
DATABASE_URL="postgresql://pos_user:pos_password@localhost:5433/retail_pos?schema=public"

# Paste your generated secrets here
JWT_SECRET=<paste-from-generator>
JWT_REFRESH_SECRET=<paste-from-generator>
QR_SIGNING_SECRET=<paste-from-generator>
SESSION_SECRET=<paste-from-generator>

# Default settings
CORS_ORIGIN=http://localhost:3000
BCRYPT_ROUNDS=12
SWAGGER_ENABLED=true
```

**✅ Verification:**
- All three `.env` files created
- `apps\api\.env` has real secrets (not placeholder text)
- DATABASE_URL points to `localhost:5433`

---

### Step 1.3: Start PostgreSQL

```bash
# Start PostgreSQL container
docker-compose up -d
```

**Expected Output:**
```
Creating network "pos_default" with the default driver
Creating pos-postgres ... done
```

**✅ Verification:**

```bash
# Check container is running
docker ps

# Should see:
# CONTAINER ID   IMAGE              PORTS                    NAMES
# <id>          postgres:16-alpine  0.0.0.0:5433->5432/tcp  pos-postgres
```

**Test database connection:**

```bash
# Using Docker exec
docker exec -it pos-postgres psql -U pos_user -d retail_pos -c "\dt"
```

**Expected:** 
- Connection successful (even if "Did not find any relations" — tables don't exist yet)

**❌ Troubleshooting:**
- If port 5433 is in use: Change port in `docker-compose.yml` and `.env`
- If container won't start: Check Docker Desktop is running
- If connection fails: Wait 10 seconds and try again (PostgreSQL might be initializing)

---

## Phase 2: Database Setup (15 minutes)

### Step 2.1: Install Dependencies

```bash
# Install all workspace dependencies
npm install

# This installs dependencies for:
# - Root workspace
# - apps/api
# - apps/web  
# - packages/shared
```

**Expected Output:**
```
added XXX packages in XXs
```

**✅ Verification:**
- `node_modules/` folder created in root
- `apps/api/node_modules/` exists
- No errors during installation

**❌ Troubleshooting:**
- If errors occur: Delete `node_modules` and `package-lock.json`, run `npm install` again
- If Prisma errors: Run `npm install` in `apps/api/` separately

---

### Step 2.2: Generate Prisma Client

```bash
cd apps\api
npm run db:generate
```

**Expected Output:**
```
✔ Generated Prisma Client
```

**✅ Verification:**
- `node_modules/.prisma/client/` folder created
- No compilation errors

---

### Step 2.3: Run Database Migrations

```bash
# Still in apps/api directory
npm run db:migrate
```

**You'll be prompted for a migration name:**
```
Enter a name for the new migration: › 
```

Type: `init` and press Enter

**Expected Output:**
```
Applying migration `20261031XXXXXX_init`
✔ Generated Prisma Client

The following migration(s) have been applied:

migrations/
  └─ 20261031XXXXXX_init/
    └─ migration.sql

Your database is now in sync with your schema.
```

**✅ Verification:**

```bash
# Check tables were created
docker exec -it pos-postgres psql -U pos_user -d retail_pos -c "\dt"
```

**Expected Output:** List of tables including:
- `users`
- `companies`
- `locations`
- `products`
- `variants`
- `inventory_movements`
- `invoices`
- `employees`
- And 20+ more tables

**❌ Troubleshooting:**
- If migration fails with connection error: Check PostgreSQL is running
- If schema errors: Check `prisma/schema.prisma` has no syntax errors
- If stuck: Delete `prisma/migrations/` folder and try again

---

### Step 2.4: Seed Database with Test Data

```bash
# Still in apps/api directory
npm run db:seed
```

**Expected Output:**
```
🌱 Seeding database...
✅ Company: Premium Retail
✅ Location: Main Warehouse
✅ Location: Sub-Warehouse North
✅ Location: Retail Store Downtown
✅ Super Admin: admin@premiumretail.com
✅ Store Manager: manager@premiumretail.com (scoped to Retail Store Downtown)
✅ Cashier: cashier@premiumretail.com (scoped to Retail Store Downtown)

🎉 Seed complete! Development credentials:
  Super Admin : admin@premiumretail.com / SuperAdmin@123
  Store Mgr   : manager@premiumretail.com / Manager@123
  Cashier     : cashier@premiumretail.com / Cashier@123
```

**✅ Verification:**

Query the database:

```bash
# Check users were created
docker exec -it pos-postgres psql -U pos_user -d retail_pos -c "SELECT email, role FROM users;"
```

**Expected Output:**
```
              email              |         role          
---------------------------------+----------------------
 admin@premiumretail.com         | SUPER_ADMIN
 manager@premiumretail.com       | STORE_MANAGER
 cashier@premiumretail.com       | CASHIER
```

**❌ Troubleshooting:**
- If seed fails: Check migration completed successfully first
- If duplicate key errors: Database already seeded (safe to ignore)
- To re-seed: Drop and recreate database:
  ```bash
  docker exec -it pos-postgres psql -U pos_user -d postgres -c "DROP DATABASE retail_pos; CREATE DATABASE retail_pos;"
  npm run db:migrate
  npm run db:seed
  ```

---

## Phase 3: Start API Server (5 minutes)

### Step 3.1: Start Development Server

```bash
# From apps/api directory
npm run dev

# OR from root directory
cd ..\..
npm run dev:api
```

**Expected Output:**
```
[Nest] XXXXX  - XX/XX/XXXX, XX:XX:XX AM     LOG [NestFactory] Starting Nest application...
[Nest] XXXXX  - XX/XX/XXXX, XX:XX:XX AM     LOG [InstanceLoader] PrismaModule dependencies initialized
[Nest] XXXXX  - XX/XX/XXXX, XX:XX:XX AM     LOG [InstanceLoader] ConfigModule dependencies initialized
[Nest] XXXXX  - XX/XX/XXXX, XX:XX:XX AM     LOG [InstanceLoader] AuthModule dependencies initialized
[Nest] XXXXX  - XX/XX/XXXX, XX:XX:XX AM     LOG [InstanceLoader] UsersModule dependencies initialized
[Nest] XXXXX  - XX/XX/XXXX, XX:XX:XX AM     LOG [InstanceLoader] CompanyModule dependencies initialized
[Nest] XXXXX  - XX/XX/XXXX, XX:XX:XX AM     LOG [InstanceLoader] LocationsModule dependencies initialized
[Nest] XXXXX  - XX/XX/XXXX, XX:XX:XX AM     LOG [InstanceLoader] HealthModule dependencies initialized
[Nest] XXXXX  - XX/XX/XXXX, XX:XX:XX AM     LOG [NestApplication] Nest application successfully started
[Nest] XXXXX  - XX/XX/XXXX, XX:XX:XX AM     LOG Application is running on: http://localhost:4000
```

**✅ Verification:**
- No red error messages
- Server started on port 4000
- All modules loaded successfully

**Keep this terminal open!** The server must be running for all tests below.

**❌ Troubleshooting:**
- If port 4000 in use: Change `PORT=4001` in `apps/api/.env`
- If connection refused: Check DATABASE_URL is correct
- If module not found: Run `npm install` again
- If TypeScript errors: Run `npm run build` first

---

## Phase 4: Test Health Check (2 minutes)

Open a **new terminal** (keep server running in first terminal).

### Test 4.1: Basic Health Check

```bash
curl http://localhost:4000/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-10-31T..."
}
```

**✅ Verification:**
- Status is "ok"
- Database shows "connected"
- Response is JSON format

**❌ Troubleshooting:**
- If no response: Check server is running (see Phase 3)
- If 404: Check the `/health` endpoint exists in `HealthController`

---

## Phase 5: Test Authentication (15 minutes)

### Test 5.1: Login as Super Admin

**Using curl:**

```bash
curl -X POST http://localhost:4000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@premiumretail.com\",\"password\":\"SuperAdmin@123\"}"
```

**Expected Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "admin@premiumretail.com",
    "role": "SUPER_ADMIN"
  }
}
```

**✅ Verification:**
- Status code: 200 OK
- Response contains `access_token` and `refresh_token`
- User role is "SUPER_ADMIN"

**💾 Save this token!** You'll need it for all subsequent requests.

## Phase 5: Transfers and Replenishment

These workflows are API based. Use two different manager accounts with access to the relevant source and destination locations. A manager who requested a transfer cannot approve that same transfer. Manual transfers may connect any two distinct active locations within one company, including locations on different branches of the hierarchy. Replenishment suggestions use the destination's configured parent as the proposed source. Every mutating transfer endpoint requires a fresh `Idempotency-Key`; reuse the same key only when retrying the exact same request as the same user.

Set `$base` to `http://localhost:4000/api/v1`; set `$sourceHeaders` and `$destinationHeaders` to `@{ Authorization = "Bearer <manager-token>" }` for the two managers. Choose an active variant that has an `AVAILABLE` balance at the source.

### Replenishment draft

```powershell
$key = [guid]::NewGuid().ToString()
$headersWithKey = @{ Authorization = $destinationHeaders.Authorization; "Idempotency-Key" = $key }
$draft = Invoke-RestMethod "$base/transfers/replenishment/generate" `
  -Method Post -Headers $headersWithKey `
  -ContentType "application/json" `
  -Body (@{ destLocationId = "<destination-location-id>" } | ConvertTo-Json)
$draft.data.lines | Select-Object variantId, availableQtyBase, reorderLevelBase, systemSuggestedQtyBase
```

The suggested quantity should be `reorderLevelBase - availableQtyBase` for each under-threshold variant. Generating the request must not change inventory balances. Approve with a different source-scoped manager using `POST /transfers/replenishment/<request-id>/approve` and a body containing one `{ variantId, approvedQtyBase }` for every suggested line. Approval creates a transfer draft; it does not dispatch stock.

For the approval request, create a new header using the source manager's token and a new key, for example: `$approvalHeaders = @{ Authorization = $sourceHeaders.Authorization; "Idempotency-Key" = [guid]::NewGuid().ToString() }`.

### Manual transfer lifecycle

1. Create a draft with `POST /transfers`, passing `sourceLocationId`, `destLocationId`, and line items such as `{ variantId, cartons: 1, looseBaseUnits: 2 }`. Cartons are converted using the product's current carton size; loose units remain in base units. Include a fresh `Idempotency-Key` header.
2. Submit with `POST /transfers/<id>/submit` and a new key.
3. Approve with a different source-scoped manager using `POST /transfers/<id>/approve`, a new key, and body `{ "lines": [{ "variantId": "<variant-id>", "approvedQtyBase": 12 }] }`.
4. Dispatch from the source using `POST /transfers/<id>/dispatch`, a new key, and body `{ "lines": [{ "variantId": "<variant-id>", "looseBaseUnits": 12 }] }`. Dispatch must fail if source available stock is insufficient. Verify that source `IN_TRANSIT` rises and destination `AVAILABLE` stays unchanged.
5. Receive at the destination using `POST /transfers/<id>/receive`, a new key, and body `{ "lines": [{ "variantId": "<variant-id>", "receivedQtyBase": 12 }] }`. Verify source `IN_TRANSIT` falls and destination `AVAILABLE` rises.

For discrepancy checks, receive damaged units using `damagedQtyBase` and a `discrepancyNotes` explanation; those units must appear in destination `QUARANTINED`. Test excess by reporting more than dispatched; excess is quarantined. A short shipment must be finalized with `finalizeLine: true`, `shortQtyBase`, and a discrepancy note. To cancel a transfer with stock still in transit, call `PATCH /transfers/<id>/cancel` with `{ "reason": "<reason>" }`; verify the remaining in-transit stock returns to source available through ledger movements. Fully received or terminal transfers cannot be cancelled.

Check `GET /transfers` and `GET /transfers/<id>` after each step for status and audit fields. Use `GET /inventory/balances?locationId=<id>&variantId=<id>` before and after each operation; stock changes should appear as movements, not edits to a stored balance.

**Using Postman/Thunder Client:**

1. Create new request: `POST http://localhost:4000/api/v1/auth/login`
2. Set header: `Content-Type: application/json`
3. Set body (raw JSON):
   ```json
   {
     "email": "admin@premiumretail.com",
     "password": "SuperAdmin@123"
   }
   ```
4. Send request
5. **Copy the `access_token` from response**

---

### Test 5.2: Login with Wrong Password

```bash
curl -X POST http://localhost:4000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@premiumretail.com\",\"password\":\"WrongPassword\"}"
```

**Expected Response:**
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

**✅ Verification:**
- Status code: 401 Unauthorized
- Error message about invalid credentials

---

### Test 5.3: Access Protected Endpoint Without Token

```bash
curl http://localhost:4000/api/v1/companies
```

**Expected Response:**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**✅ Verification:**
- Status code: 401 Unauthorized
- Cannot access without authentication

---

## Phase 6: Test Company Module (20 minutes)

**Setup:** Make sure you have the Super Admin token from Test 5.1.

### Test 6.1: Create Company

```bash
curl -X POST http://localhost:4000/api/v1/companies ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" ^
  -d "{\"name\":\"Test Company Ltd\",\"currency\":\"INR\",\"invoicePrefix\":\"TEST\"}"
```

**Replace `YOUR_ACCESS_TOKEN_HERE` with your actual token!**

**Expected Response:**
```json
{
  "id": "...",
  "name": "Test Company Ltd",
  "currency": "INR",
  "timezone": "Asia/Kolkata",
  "invoicePrefix": "TEST",
  "gstNumber": null,
  "createdAt": "...",
  "updatedAt": "...",
  "locations": []
}
```

**✅ Verification:**
- Status code: 201 Created
- Company created with correct data
- Default timezone set to "Asia/Kolkata"

---

### Test 6.2: List All Companies

```bash
curl http://localhost:4000/api/v1/companies ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

**Expected Response:**
```json
[
  {
    "id": "...",
    "name": "Premium Retail",
    "currency": "INR",
    "locations": [...],
    "_count": {
      "locations": 4
    }
  },
  {
    "id": "...",
    "name": "Test Company Ltd",
    ...
  }
]
```

**✅ Verification:**
- Status code: 200 OK
- Array of companies returned
- Includes seed company and newly created company

---

### Test 6.3: Get Single Company

```bash
# Replace COMPANY_ID with actual ID from previous response
curl http://localhost:4000/api/v1/companies/COMPANY_ID ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

**Expected Response:**
```json
{
  "id": "...",
  "name": "Test Company Ltd",
  "currency": "INR",
  "timezone": "Asia/Kolkata",
  "invoicePrefix": "TEST",
  "locations": [...],
  "_count": {
    "locations": 0
  }
}
```

**✅ Verification:**
- Status code: 200 OK
- Company details with locations array

---

### Test 6.4: Test Duplicate Company Name

```bash
curl -X POST http://localhost:4000/api/v1/companies ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" ^
  -d "{\"name\":\"Test Company Ltd\",\"currency\":\"INR\"}"
```

**Expected Response:**
```json
{
  "statusCode": 409,
  "message": "Company with name \"Test Company Ltd\" already exists",
  "error": "Conflict"
}
```

**✅ Verification:**
- Status code: 409 Conflict
- Duplicate validation works

---

## Phase 7: Test Location Module (30 minutes)

### Test 7.1: Create Main Warehouse

```bash
curl -X POST http://localhost:4000/api/v1/locations ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" ^
  -d "{\"companyId\":\"COMPANY_ID\",\"name\":\"Test Main Warehouse\",\"type\":\"MAIN_WAREHOUSE\",\"address\":\"Test Address\"}"
```

**Replace `COMPANY_ID` with your company ID!**

**Expected Response:**
```json
{
  "id": "...",
  "name": "Test Main Warehouse",
  "type": "MAIN_WAREHOUSE",
  "address": "Test Address",
  "parentId": null,
  "isActive": true,
  "company": {
    "id": "...",
    "name": "Test Company Ltd"
  }
}
```

**✅ Verification:**
- Status code: 201 Created
- `type` is "MAIN_WAREHOUSE"
- `parentId` is null (no parent)

**💾 Save this location ID for next tests!**

---

### Test 7.2: Create Sub-Warehouse Under Main

```bash
curl -X POST http://localhost:4000/api/v1/locations ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" ^
  -d "{\"companyId\":\"COMPANY_ID\",\"name\":\"Test Sub-Warehouse\",\"type\":\"SUB_WAREHOUSE\",\"address\":\"Sub Address\",\"parentId\":\"MAIN_WAREHOUSE_ID\"}"
```

**Replace `COMPANY_ID` and `MAIN_WAREHOUSE_ID`!**

**Expected Response:**
```json
{
  "id": "...",
  "name": "Test Sub-Warehouse",
  "type": "SUB_WAREHOUSE",
  "parentId": "...",
  "parent": {
    "id": "...",
    "name": "Test Main Warehouse",
    "type": "MAIN_WAREHOUSE"
  }
}
```

**✅ Verification:**
- Status code: 201 Created
- `parentId` matches Main Warehouse ID
- Hierarchy correctly established

---

### Test 7.3: Test Hierarchy Validation (Should Fail)

Try to create Main Warehouse with a parent (invalid):

```bash
curl -X POST http://localhost:4000/api/v1/locations ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" ^
  -d "{\"companyId\":\"COMPANY_ID\",\"name\":\"Invalid Warehouse\",\"type\":\"MAIN_WAREHOUSE\",\"parentId\":\"SOME_PARENT_ID\"}"
```

**Expected Response:**
```json
{
  "statusCode": 400,
  "message": "Main Warehouse cannot have a parent location",
  "error": "Bad Request"
}
```

**✅ Verification:**
- Status code: 400 Bad Request
- Hierarchy validation prevents invalid structure

---

### Test 7.4: List All Locations

```bash
curl http://localhost:4000/api/v1/locations ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

**Expected Response:**
```json
[
  {
    "id": "...",
    "name": "Main Warehouse",
    "type": "MAIN_WAREHOUSE",
    "children": [...]
  },
  {
    "id": "...",
    "name": "Test Main Warehouse",
    "type": "MAIN_WAREHOUSE",
    "children": [...]
  },
  ...
]
```

**✅ Verification:**
- Status code: 200 OK
- Array of locations with hierarchy
- Includes both seed and test locations

---

### Test 7.5: Filter Locations by Type

```bash
curl "http://localhost:4000/api/v1/locations?type=MAIN_WAREHOUSE" ^
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

**Expected Response:**
```json
[
  {
    "name": "Main Warehouse",
    "type": "MAIN_WAREHOUSE"
  },
  {
    "name": "Test Main Warehouse",
    "type": "MAIN_WAREHOUSE"
  }
]
```

**✅ Verification:**
- Only MAIN_WAREHOUSE type locations returned
- Filtering works correctly

---

## Phase 8: Test Authorization Guards (25 minutes)

### Test 8.1: Login as Cashier

```bash
curl -X POST http://localhost:4000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"cashier@premiumretail.com\",\"password\":\"Cashier@123\"}"
```

**Expected Response:**
```json
{
  "access_token": "...",
  "user": {
    "email": "cashier@premiumretail.com",
    "role": "CASHIER"
  }
}
```

**💾 Save this CASHIER token!**

---

### Test 8.2: Cashier Cannot Create Company (Should Fail)

```bash
curl -X POST http://localhost:4000/api/v1/companies ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer CASHIER_TOKEN_HERE" ^
  -d "{\"name\":\"Unauthorized Company\",\"currency\":\"INR\"}"
```

**Expected Response:**
```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```

**✅ Verification:**
- Status code: 403 Forbidden
- Cashier cannot access Super Admin endpoints

---

### Test 8.3: Cashier Cannot List All Companies (Should Fail)

```bash
curl http://localhost:4000/api/v1/companies ^
  -H "Authorization: Bearer CASHIER_TOKEN_HERE"
```

**Expected Response:**
```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```

**✅ Verification:**
- Status code: 403 Forbidden
- Role-based access control working

---

### Test 8.4: Login as Store Manager

```bash
curl -X POST http://localhost:4000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"manager@premiumretail.com\",\"password\":\"Manager@123\"}"
```

**💾 Save this MANAGER token!**

---

### Test 8.5: Manager Can View Locations

```bash
curl http://localhost:4000/api/v1/locations ^
  -H "Authorization: Bearer MANAGER_TOKEN_HERE"
```

**Expected Response:**
```json
[
  {
    "id": "...",
    "name": "Retail Store Downtown",
    "type": "RETAIL_STORE"
  }
]
```

**✅ Verification:**
- Status code: 200 OK
- Manager can view locations (within their scope)

---

### Test 8.6: Manager Cannot Create Company (Should Fail)

```bash
curl -X POST http://localhost:4000/api/v1/companies ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer MANAGER_TOKEN_HERE" ^
  -d "{\"name\":\"Unauthorized Company\",\"currency\":\"INR\"}"
```

**Expected Response:**
```json
{
  "statusCode": 403,
  "message": "Forbidden resource",
  "error": "Forbidden"
}
```

**✅ Verification:**
- Manager cannot access Super Admin endpoints

---

## Phase 9: Test Validation (15 minutes)

### Test 9.1: Invalid Email Format

```bash
curl -X POST http://localhost:4000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"invalid-email\",\"password\":\"test\"}"
```

**Expected Response:**
```json
{
  "statusCode": 400,
  "message": ["email must be an email"],
  "error": "Bad Request"
}
```

**✅ Verification:**
- DTO validation catches invalid email

---

### Test 9.2: Missing Required Fields

```bash
curl -X POST http://localhost:4000/api/v1/companies ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" ^
  -d "{\"currency\":\"INR\"}"
```

**Expected Response:**
```json
{
  "statusCode": 400,
  "message": [
    "Company name must be at least 2 characters long",
    "name should not be empty"
  ],
  "error": "Bad Request"
}
```

**✅ Verification:**
- Validation catches missing `name` field

---

### Test 9.3: Invalid GST Number Format

```bash
curl -X POST http://localhost:4000/api/v1/companies ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN" ^
  -d "{\"name\":\"Test GST\",\"gstNumber\":\"INVALID\"}"
```

**Expected Response:**
```json
{
  "statusCode": 400,
  "message": [
    "Invalid GST number format. Expected format: 22AAAAA0000A1Z5"
  ],
  "error": "Bad Request"
}
```

**✅ Verification:**
- GST format validation works

---

## Phase 10: Test Inventory Ledger, Opening Stock & Supplier Receiving

Use a test location and a test product variant. Ledger records are append-only, so these operations intentionally create permanent test history; do not use a production location/product for smoke tests.

```powershell
$base = "http://localhost:4000/api/v1"
$loginBody = @{ email = "admin@premiumretail.com"; password = "YOUR_ADMIN_PASSWORD" } | ConvertTo-Json
$login = Invoke-RestMethod "$base/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
$locationId = "YOUR_TEST_LOCATION_ID"
$variantId = "YOUR_TEST_VARIANT_ID"
```

### Test 10.1: Import Opening Stock

```powershell
$key = "opening-smoke-$([guid]::NewGuid())"
$headers = @{ Authorization = "Bearer $($login.data.accessToken)"; "Idempotency-Key" = $key }
$body = @{
  locationId = $locationId
  lines = @(@{ variantId = $variantId; quantityBaseUnits = 25 })
  notes = "Phase 4 opening stock smoke test"
} | ConvertTo-Json -Depth 5
$opening = Invoke-RestMethod "$base/inventory/opening-stock/import" -Method Post -Headers $headers -ContentType "application/json" -Body $body
$opening.data.movements | Select-Object type, quantityBaseUnits, actorId, referenceType, referenceId
```

Expected: one `OPENING_STOCK` movement for 25 units, linked to the import batch and the logged-in user.

### Test 10.2: Confirm Supplier Receipt in Cartons and Loose Units

```powershell
$key = "receipt-smoke-$([guid]::NewGuid())"
$headers = @{ Authorization = "Bearer $($login.data.accessToken)"; "Idempotency-Key" = $key }
$body = @{
  locationId = $locationId
  receiptNumber = "TEST-$([guid]::NewGuid())"
  supplierName = "Phase 4 Test Supplier"
  lines = @(@{ variantId = $variantId; cartons = 2; looseBaseUnits = 3 })
  notes = "Expected total is 2 x product carton ratio + 3 loose units"
} | ConvertTo-Json -Depth 5
$receipt = Invoke-RestMethod "$base/receiving/receipts" -Method Post -Headers $headers -ContentType "application/json" -Body $body
$receipt.data | Select-Object receiptNumber, supplierName, receivedByUserId, confirmedAt
$receipt.data.lines | Select-Object variantId, cartons, looseBaseUnits, unitsPerCarton, quantityBaseUnits
$receipt.data.movements | Select-Object quantityBaseUnits, actorId, referenceType, referenceId
```

Expected: the receipt line quantity equals `2 * unitsPerCarton + 3`; both the receipt and movement identify the receiving user, and the movement references the confirmed receipt.

### Test 10.3: Verify Idempotency and Ledger Balance

Repeat the exact preceding receipt request with the same `$headers`, `$body`, and `Idempotency-Key`. It should return `replayed = true` and must not add another movement:

```powershell
$receiptReplay = Invoke-RestMethod "$base/receiving/receipts" -Method Post -Headers $headers -ContentType "application/json" -Body $body
$receiptReplay.data.replayed
```

Then query the location balance:

```powershell
$headers = @{ Authorization = "Bearer $($login.data.accessToken)" }
$balances = Invoke-RestMethod "$base/inventory/balances?locationId=$locationId&variantId=$variantId" -Headers $headers
$balances.data | Select-Object sku, stockState, quantityBaseUnits, formattedQuantity, negativeAvailable, warning
```

Expected: the Available balance is the sum of the opening-stock and supplier-receipt movements. The other three stock states are returned separately. A negative Available balance includes `negativeAvailable = true` and a warning; cashier display is part of the Phase 6 POS interface.

## ✅ Test Results Summary

Create a checklist as you complete each phase:

### Environment Setup
- [ ] Secrets generated successfully
- [ ] Environment files configured
- [ ] PostgreSQL container running

### Database Setup
- [ ] Dependencies installed
- [ ] Prisma client generated
- [ ] Migrations applied (25+ tables created)
- [ ] Seed data loaded (3 users, 1 company, 4 locations)

### API Server
- [ ] Server starts without errors
- [ ] All modules loaded (Auth, Users, Company, Locations, Products, Inventory, Supplier Receiving, Health)
- [ ] Health check returns "ok"

### Authentication
- [ ] Super Admin login works
- [ ] JWT token received
- [ ] Wrong password rejected
- [ ] Protected endpoints require token

### Company Module
- [ ] Create company works
- [ ] List companies works
- [ ] Get single company works
- [ ] Duplicate name validation works
- [ ] Statistics endpoint works

### Location Module
- [ ] Create Main Warehouse works
- [ ] Create Sub-Warehouse with parent works
- [ ] Hierarchy validation prevents invalid structures
- [ ] List all locations works
- [ ] Filter by type works

### Authorization Guards
- [ ] Cashier cannot create companies (403)
- [ ] Cashier cannot list companies (403)
- [ ] Manager can view locations
- [ ] Manager cannot create companies (403)
- [ ] Super Admin has full access

### Validation
- [ ] Email validation works
- [ ] Opening stock import creates one idempotent ledger batch
- [ ] Supplier receipt converts cartons and loose units correctly
- [ ] Supplier receipt and movement retain receiver identity and receipt reference
- [ ] Inventory balances equal ledger totals for each stock state
- [ ] Required field validation works
- [ ] GST number format validation works

---

## 🎯 Success Criteria

**You're ready to move to Sprint 02 when:**
- ✅ All checkboxes above are checked
- ✅ No TypeScript compilation errors
- ✅ All HTTP responses return expected status codes
- ✅ Authorization prevents unauthorized access
- ✅ Validation catches invalid inputs
- ✅ Database persists data correctly

---

## 📸 Screenshots to Capture

For documentation, capture:
1. ✅ Server startup logs showing all modules loaded
2. ✅ Successful login response with token
3. ✅ Company creation with 201 status
4. ✅ 403 Forbidden response for cashier
5. ✅ Location hierarchy showing parent/child relationships
6. ✅ Validation error messages

---

## 🐛 Common Issues & Solutions

### Issue: "Port 4000 already in use"
**Solution:** Change port in `apps/api/.env` to `4001` or kill the process using port 4000

### Issue: "Cannot connect to database"
**Solution:** 
1. Check Docker is running: `docker ps`
2. Restart PostgreSQL: `docker-compose restart`
3. Check DATABASE_URL in `.env` is correct

### Issue: "JWT token invalid"
**Solution:**
1. Token might be expired (8 hour lifetime)
2. Login again to get new token
3. Check JWT_SECRET is same in both `.env` and server

### Issue: "Module not found" errors
**Solution:**
1. Delete `node_modules/` and `package-lock.json`
2. Run `npm install` again
3. Run `npm run db:generate` in `apps/api/`

### Issue: "Migrations fail"
**Solution:**
1. Drop and recreate database:
   ```bash
   docker exec -it pos-postgres psql -U pos_user -d postgres -c "DROP DATABASE retail_pos; CREATE DATABASE retail_pos;"
   ```
2. Run migrations again: `npm run db:migrate`

---

## 📝 Next Steps After Testing

Once all tests pass:
1. ✅ Mark Sprint 01 as complete
2. ✅ Update `docs/CHANGELOG.md` with tested features
3. ✅ Move to Sprint 02 tasks (User management enhancements)
4. ✅ Set up Swagger API documentation
5. ✅ Write automated integration tests

---

**Testing Date:** ___________  
**Tested By:** ___________  
**Result:** Pass / Fail  
**Notes:** ___________
