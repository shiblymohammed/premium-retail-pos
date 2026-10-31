# Quick Test Reference Card

> Copy-paste commands for rapid manual testing. Keep this handy!

---

## 🚀 Quick Start (First Time Setup)

```bash
# 1. Generate secrets
node scripts\generate-secrets.js

# 2. Copy environment files
copy .env.example .env
copy apps\api\.env.example apps\api\.env

# 3. Edit apps\api\.env and paste generated secrets

# 4. Start database
docker-compose up -d

# 5. Install dependencies
npm install

# 6. Setup database
cd apps\api
npm run db:generate
npm run db:migrate
npm run db:seed

# 7. Start server
npm run dev
```

---

## 🔐 Default Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `admin@premiumretail.com` | `SuperAdmin@123` |
| Store Manager | `manager@premiumretail.com` | `Manager@123` |
| Cashier | `cashier@premiumretail.com` | `Cashier@123` |

---

## 🧪 Essential Test Commands

### Health Check
```bash
curl http://localhost:4000/health
```

### Login as Super Admin
```bash
curl -X POST http://localhost:4000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@premiumretail.com\",\"password\":\"SuperAdmin@123\"}"
```

**💾 Save the `access_token` from response!**

---

## 🏢 Company Endpoints

**Set your token:**
```bash
set TOKEN=your_access_token_here
```

### Create Company
```bash
curl -X POST http://localhost:4000/api/v1/companies ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %TOKEN%" ^
  -d "{\"name\":\"My Company\",\"currency\":\"INR\",\"invoicePrefix\":\"MYC\"}"
```

### List All Companies
```bash
curl http://localhost:4000/api/v1/companies ^
  -H "Authorization: Bearer %TOKEN%"
```

### Get Single Company
```bash
curl http://localhost:4000/api/v1/companies/COMPANY_ID ^
  -H "Authorization: Bearer %TOKEN%"
```

### Get Company Statistics
```bash
curl http://localhost:4000/api/v1/companies/COMPANY_ID/statistics ^
  -H "Authorization: Bearer %TOKEN%"
```

---

## 📍 Location Endpoints

### Create Main Warehouse
```bash
curl -X POST http://localhost:4000/api/v1/locations ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %TOKEN%" ^
  -d "{\"companyId\":\"COMPANY_ID\",\"name\":\"Main Warehouse\",\"type\":\"MAIN_WAREHOUSE\"}"
```

### Create Sub-Warehouse
```bash
curl -X POST http://localhost:4000/api/v1/locations ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %TOKEN%" ^
  -d "{\"companyId\":\"COMPANY_ID\",\"name\":\"Sub-Warehouse\",\"type\":\"SUB_WAREHOUSE\",\"parentId\":\"MAIN_ID\"}"
```

### Create Retail Store
```bash
curl -X POST http://localhost:4000/api/v1/locations ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %TOKEN%" ^
  -d "{\"companyId\":\"COMPANY_ID\",\"name\":\"Store\",\"type\":\"RETAIL_STORE\",\"parentId\":\"SUB_ID\",\"latitude\":12.9716,\"longitude\":77.5946,\"geofenceRadius\":50}"
```

### List All Locations
```bash
curl http://localhost:4000/api/v1/locations ^
  -H "Authorization: Bearer %TOKEN%"
```

### Filter by Type
```bash
curl "http://localhost:4000/api/v1/locations?type=MAIN_WAREHOUSE" ^
  -H "Authorization: Bearer %TOKEN%"
```

### Get Single Location
```bash
curl http://localhost:4000/api/v1/locations/LOCATION_ID ^
  -H "Authorization: Bearer %TOKEN%"
```

---

## 🔍 Database Queries

### Check if PostgreSQL is running
```bash
docker ps
```

### View all users
```bash
docker exec -it pos-postgres psql -U pos_user -d retail_pos -c "SELECT email, role FROM users;"
```

### View all companies
```bash
docker exec -it pos-postgres psql -U pos_user -d retail_pos -c "SELECT name, currency, \"invoicePrefix\" FROM companies;"
```

### View location hierarchy
```bash
docker exec -it pos-postgres psql -U pos_user -d retail_pos -c "SELECT name, type, \"parentId\" FROM locations ORDER BY type;"
```

### Count records
```bash
docker exec -it pos-postgres psql -U pos_user -d retail_pos -c "SELECT 'users' as table_name, COUNT(*) FROM users UNION SELECT 'companies', COUNT(*) FROM companies UNION SELECT 'locations', COUNT(*) FROM locations;"
```

---

## 🐛 Troubleshooting Commands

### Check server logs
```bash
# Server should be running with 'npm run dev'
# Logs appear in the terminal where server is running
```

### Restart PostgreSQL
```bash
docker-compose restart
```

### Stop PostgreSQL
```bash
docker-compose down
```

### Re-seed database (fresh start)
```bash
cd apps\api
npm run db:migrate
npm run db:seed
```

### Check Prisma schema is valid
```bash
cd apps\api
npx prisma validate
```

### View Prisma Studio (GUI)
```bash
cd apps\api
npm run db:studio
# Opens at http://localhost:5555
```

---

## 📊 Expected Response Codes

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 200 | OK | Successful GET/PATCH |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Validation error, missing fields |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Insufficient permissions (role) |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate entry (unique constraint) |
| 500 | Server Error | Code bug, database error |

---

## 🎯 Quick Validation Tests

### Test 1: Authentication Required
```bash
# Should return 401
curl http://localhost:4000/api/v1/companies
```

### Test 2: Wrong Password
```bash
# Should return 401
curl -X POST http://localhost:4000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@premiumretail.com\",\"password\":\"wrong\"}"
```

### Test 3: Duplicate Company Name
```bash
# Create same company twice - should return 409
curl -X POST http://localhost:4000/api/v1/companies ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %TOKEN%" ^
  -d "{\"name\":\"Duplicate Test\",\"currency\":\"INR\"}"

# Run again - should fail with 409
```

### Test 4: Invalid Location Hierarchy
```bash
# Main Warehouse cannot have parent - should return 400
curl -X POST http://localhost:4000/api/v1/locations ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %TOKEN%" ^
  -d "{\"companyId\":\"COMPANY_ID\",\"name\":\"Invalid\",\"type\":\"MAIN_WAREHOUSE\",\"parentId\":\"SOME_ID\"}"
```

### Test 5: Role Authorization
```bash
# Login as cashier
curl -X POST http://localhost:4000/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"cashier@premiumretail.com\",\"password\":\"Cashier@123\"}"

# Try to create company (should return 403)
curl -X POST http://localhost:4000/api/v1/companies ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer CASHIER_TOKEN" ^
  -d "{\"name\":\"Test\",\"currency\":\"INR\"}"
```

---

## 💡 Pro Tips

### Use Environment Variables for Token
```bash
# PowerShell
$TOKEN = "your_token_here"
curl http://localhost:4000/api/v1/companies -H "Authorization: Bearer $TOKEN"

# CMD
set TOKEN=your_token_here
curl http://localhost:4000/api/v1/companies -H "Authorization: Bearer %TOKEN%"
```

### Pretty Print JSON Responses
```bash
# Install jq: https://stedolan.github.io/jq/
curl http://localhost:4000/api/v1/companies -H "Authorization: Bearer %TOKEN%" | jq
```

### Save Responses to File
```bash
curl http://localhost:4000/api/v1/companies -H "Authorization: Bearer %TOKEN%" > companies.json
```

### Check API Response Time
```bash
curl -w "\nTime: %{time_total}s\n" http://localhost:4000/health
```

---

## 🔗 Useful URLs

| Service | URL |
|---------|-----|
| API Server | http://localhost:4000 |
| Health Check | http://localhost:4000/health |
| Swagger API Docs | http://localhost:4000/api (if enabled) |
| Prisma Studio | http://localhost:5555 (run `npm run db:studio`) |
| PostgreSQL | localhost:5433 |

---

## 📱 Postman Collection Import

If using Postman, create these as a collection:

1. **Environment Variables:**
   - `API_URL`: `http://localhost:4000`
   - `TOKEN`: `{{token}}` (auto-set after login)

2. **Login Request (Auto-save token):**
   - Method: POST
   - URL: `{{API_URL}}/api/v1/auth/login`
   - Body: `{"email":"admin@premiumretail.com","password":"SuperAdmin@123"}`
   - Tests tab:
     ```javascript
     pm.environment.set("token", pm.response.json().access_token);
     ```

3. **All other requests:**
   - Header: `Authorization: Bearer {{token}}`

---

## 🎓 Learning Resources

- **NestJS Docs**: https://docs.nestjs.com
- **Prisma Docs**: https://www.prisma.io/docs
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **JWT.io**: https://jwt.io (decode tokens)

---

**Keep this reference handy for quick testing!**
