# Sprint 01: Foundation & Core Setup

**Duration**: 2 Weeks  
**Goal**: Complete database setup, authentication flow, and Company/Location management module  
**Target Completion**: ~25% overall project progress

---

## Sprint Objectives

- ✅ Set up local development environment with PostgreSQL
- ✅ Configure environment variables and secrets
- ✅ Run initial Prisma migrations
- ✅ Create comprehensive seed data
- ✅ Implement Company & Location CRUD APIs
- ✅ Build User management with location scope assignment
- ✅ Test end-to-end authentication and authorization
- ✅ Verify dual-axis authorization (RBAC + Location Scope)

---

## Daily Breakdown

### **Week 1: Environment Setup & Database Foundation**

#### **Day 1: Environment & Database Setup**
- [ ] **Task 1.1**: Copy and configure `.env` files
  - [ ] Root `.env` file
  - [ ] `apps/api/.env` file with DATABASE_URL
  - [ ] Generate secure JWT_SECRET (256-bit)
  - [ ] Set PORT, NODE_ENV, CORS_ORIGIN
  - **Estimated Time**: 30 minutes
  - **Files**: `.env`, `apps/api/.env`

- [ ] **Task 1.2**: Start PostgreSQL with Docker
  - [ ] Run `docker-compose up -d`
  - [ ] Verify PostgreSQL is running on port 5433
  - [ ] Test connection with `psql` or database client
  - **Estimated Time**: 20 minutes
  - **Command**: `docker-compose up -d`

- [ ] **Task 1.3**: Run Prisma Migrations
  - [ ] Generate Prisma Client: `npm run db:generate --workspace=apps/api`
  - [ ] Run initial migration: `npm run db:migrate --workspace=apps/api`
  - [ ] Verify all tables created in PostgreSQL
  - **Estimated Time**: 30 minutes
  - **Command**: `npm run db:migrate`

- [ ] **Task 1.4**: Create Seed Data Script
  - [ ] Implement `apps/api/prisma/seed.ts` with:
    - 1 Company record
    - 1 Main Warehouse, 2 Sub-Warehouses, 3 Retail Stores
    - Super Admin user
    - Admin, Central Manager, Store Manager, Cashier users
    - 5 Product Categories
    - 20 Products (10 with cartons, 10 packet-only)
    - 40 Variants (sizes, colors)
  - [ ] Run seed script: `npm run db:seed --workspace=apps/api`
  - **Estimated Time**: 3 hours
  - **Files**: `apps/api/prisma/seed.ts`

#### **Day 2: Authentication Testing & Verification**
- [ ] **Task 2.1**: Test Login Flow
  - [ ] POST `/api/v1/auth/login` with seeded users
  - [ ] Verify JWT token generation
  - [ ] Test refresh token rotation
  - [ ] Validate token expiration
  - **Estimated Time**: 1 hour
  - **Tools**: Postman/Thunder Client/curl

- [ ] **Task 2.2**: Test Authorization Guards
  - [ ] Test protected endpoints require valid JWT
  - [ ] Test role-based access (SUPER_ADMIN vs CASHIER)
  - [ ] Test location scope restrictions
  - [ ] Verify 401/403 responses for unauthorized access
  - **Estimated Time**: 2 hours
  - **Focus**: `RolesGuard`, `LocationScopeGuard`

- [ ] **Task 2.3**: Create Postman/Thunder Client Collection
  - [ ] Environment variables (API_URL, TOKEN)
  - [ ] Auth endpoints (login, refresh)
  - [ ] Pre-request scripts for token injection
  - [ ] Save collection to `docs/api-collection.json`
  - **Estimated Time**: 1 hour
  - **Files**: `docs/api-collection.json`

#### **Day 3: Company Module Implementation**
- [ ] **Task 3.1**: Company Service
  - [ ] Create `apps/api/src/modules/company/company.service.ts`
  - [ ] Implement methods:
    - `create(dto: CreateCompanyDto)`
    - `findAll()` (Super Admin only)
    - `findOne(id: string)`
    - `update(id: string, dto: UpdateCompanyDto)`
    - `updateInvoicePrefix(companyId: string, prefix: string)`
  - **Estimated Time**: 2 hours
  - **Files**: `company.service.ts`

- [ ] **Task 3.2**: Company DTOs
  - [ ] Create `dto/create-company.dto.ts` with validation:
    - `name` (required, min 2 chars)
    - `currency` (default 'INR')
    - `timezone` (default 'Asia/Kolkata')
    - `invoicePrefix` (default 'INV', max 10 chars)
    - `gstNumber` (optional, pattern validation)
  - [ ] Create `dto/update-company.dto.ts` (PartialType)
  - **Estimated Time**: 1 hour
  - **Files**: `dto/*.dto.ts`

- [ ] **Task 3.3**: Company Controller
  - [ ] Create `company.controller.ts` with endpoints:
    - `POST /api/v1/companies` (@Roles('SUPER_ADMIN'))
    - `GET /api/v1/companies` (@Roles('SUPER_ADMIN'))
    - `GET /api/v1/companies/:id` (Authenticated)
    - `PATCH /api/v1/companies/:id` (@Roles('SUPER_ADMIN'))
  - [ ] Add API documentation decorators
  - **Estimated Time**: 1.5 hours
  - **Files**: `company.controller.ts`

- [ ] **Task 3.4**: Company Module Setup
  - [ ] Create `company.module.ts`
  - [ ] Register in `app.module.ts`
  - [ ] Test all endpoints with Postman
  - **Estimated Time**: 30 minutes
  - **Files**: `company.module.ts`, `app.module.ts`

#### **Day 4: Location Module - Service Layer**
- [ ] **Task 4.1**: Location Service - CRUD Operations
  - [ ] Create `apps/api/src/modules/locations/locations.service.ts`
  - [ ] Implement core methods:
    - `create(dto: CreateLocationDto)`
    - `findAll(filters?: LocationFilters)`
    - `findByCompany(companyId: string)`
    - `findByType(type: LocationType)`
    - `findOne(id: string)`
    - `update(id: string, dto: UpdateLocationDto)`
    - `deactivate(id: string)` (soft delete with validation)
  - **Estimated Time**: 3 hours
  - **Files**: `locations.service.ts`

- [ ] **Task 4.2**: Location Service - Business Logic
  - [ ] Implement hierarchy validation:
    - Main Warehouse cannot have parent
    - Sub-Warehouse must have Main Warehouse parent
    - Retail Store must have Sub-Warehouse or Main Warehouse parent
  - [ ] Implement `canDeactivate(locationId)`:
    - Check for active stock movements
    - Check for active transfers
    - Check for assigned employees
  - [ ] Implement `setAuditLock(locationId, locked: boolean)`
  - **Estimated Time**: 2 hours
  - **Files**: `locations.service.ts`

#### **Day 5: Location Module - API Layer**
- [ ] **Task 5.1**: Location DTOs
  - [ ] Create `dto/create-location.dto.ts`:
    - `companyId` (UUID, required)
    - `name` (string, required, 2-100 chars)
    - `type` (LocationType enum, required)
    - `address` (optional string)
    - `latitude` / `longitude` (optional decimals, -90 to 90, -180 to 180)
    - `geofenceRadius` (optional int, 10-500 meters)
    - `parentId` (UUID, conditional validation)
    - `managerId` (UUID, optional)
  - [ ] Create `dto/update-location.dto.ts` (PartialType)
  - [ ] Create `dto/location-filters.dto.ts`
  - **Estimated Time**: 2 hours
  - **Files**: `dto/*.dto.ts`

- [ ] **Task 5.2**: Location Controller
  - [ ] Create `locations.controller.ts` with endpoints:
    - `POST /api/v1/locations` (@Roles('SUPER_ADMIN', 'ADMIN'))
    - `GET /api/v1/locations` (Location-scoped)
    - `GET /api/v1/locations/:id` (Location-scoped)
    - `PATCH /api/v1/locations/:id` (@Roles('SUPER_ADMIN', 'ADMIN'))
    - `DELETE /api/v1/locations/:id` (Soft delete, Admin+)
    - `POST /api/v1/locations/:id/audit-lock` (Manager+)
  - [ ] Apply `@LocationScopeGuard()` where needed
  - **Estimated Time**: 2 hours
  - **Files**: `locations.controller.ts`

- [ ] **Task 5.3**: Location Module Integration
  - [ ] Update `locations.module.ts` to export service
  - [ ] Register in `app.module.ts`
  - [ ] Add Swagger API documentation tags
  - **Estimated Time**: 30 minutes
  - **Files**: `locations.module.ts`

### **Week 2: User Management & Authorization**

#### **Day 6: User Management Module**
- [ ] **Task 6.1**: User Service Enhancements
  - [ ] Update `apps/api/src/modules/users/users.service.ts`:
    - `create(dto: CreateUserDto)` with password hashing
    - `findAll(filters?: UserFilters)`
    - `findByEmail(email: string)`
    - `findByRole(role: Role)`
    - `update(id: string, dto: UpdateUserDto)`
    - `deactivate(id: string)`
    - `changePassword(userId: string, oldPassword: string, newPassword: string)`
  - **Estimated Time**: 2 hours
  - **Files**: `users.service.ts`

- [ ] **Task 6.2**: User Location Scope Management
  - [ ] Create `UserLocationScopeService`:
    - `assignLocation(userId: string, locationId: string)`
    - `removeLocation(userId: string, locationId: string)`
    - `getUserLocations(userId: string)`
    - `getUsersByLocation(locationId: string)`
    - `validateUserLocationAccess(userId: string, locationId: string)`
  - **Estimated Time**: 2 hours
  - **Files**: `user-location-scope.service.ts`

- [ ] **Task 6.3**: User DTOs & Validation
  - [ ] Update `dto/create-user.dto.ts`:
    - Email validation (IsEmail)
    - Password strength (min 8 chars, regex pattern)
    - Role validation (IsEnum)
    - Location scope assignments array
  - [ ] Create `dto/update-user.dto.ts`
  - [ ] Create `dto/assign-location.dto.ts`
  - [ ] Create `dto/change-password.dto.ts`
  - **Estimated Time**: 1.5 hours
  - **Files**: `dto/*.dto.ts`

#### **Day 7: User API & Testing**
- [ ] **Task 7.1**: User Controller Implementation
  - [ ] Update `users.controller.ts` with endpoints:
    - `POST /api/v1/users` (@Roles('SUPER_ADMIN', 'ADMIN'))
    - `GET /api/v1/users` (Admin+, location-scoped)
    - `GET /api/v1/users/:id` (Self or Admin+)
    - `PATCH /api/v1/users/:id` (Admin+)
    - `DELETE /api/v1/users/:id` (Soft delete, Admin+)
    - `POST /api/v1/users/:id/locations` (Admin+)
    - `DELETE /api/v1/users/:id/locations/:locationId` (Admin+)
    - `POST /api/v1/users/change-password` (Authenticated, Self only)
  - **Estimated Time**: 2.5 hours
  - **Files**: `users.controller.ts`

- [ ] **Task 7.2**: Integration Testing - User Management
  - [ ] Test user creation with different roles
  - [ ] Test location scope assignment
  - [ ] Test role-based access restrictions
  - [ ] Test location-scoped queries
  - [ ] Test password change flow
  - [ ] Test user deactivation
  - **Estimated Time**: 2 hours
  - **Tools**: Postman/Jest

#### **Day 8: Location Scope Guard Enhancement**
- [ ] **Task 8.1**: Enhance LocationScopeGuard
  - [ ] Update `apps/api/src/common/guards/location-scope.guard.ts`:
    - Extract location ID from request params/body/query
    - Validate user has access to requested location
    - Super Admin bypass logic
    - Central Manager sees all warehouses
    - Store Manager sees only assigned store
  - [ ] Add unit tests for guard logic
  - **Estimated Time**: 2 hours
  - **Files**: `location-scope.guard.ts`

- [ ] **Task 8.2**: Create Custom Decorators
  - [ ] Create `@LocationScoped()` parameter decorator
  - [ ] Create `@AllowedRoles(...roles)` decorator
  - [ ] Create `@RequireLocationAccess()` decorator
  - [ ] Update existing controllers to use new decorators
  - **Estimated Time**: 2 hours
  - **Files**: `common/decorators/*.ts`

- [ ] **Task 8.3**: Authorization Testing Suite
  - [ ] Test Super Admin can access all locations
  - [ ] Test Store Manager restricted to assigned store
  - [ ] Test Cashier cannot access other stores
  - [ ] Test Central Manager can access all warehouses
  - [ ] Test unauthorized access returns 403
  - **Estimated Time**: 2 hours
  - **Files**: `test/auth/*.spec.ts`

#### **Day 9: Employee Module Foundation**
- [ ] **Task 9.1**: Employee Service
  - [ ] Create `apps/api/src/modules/employees/employees.service.ts`:
    - `create(dto: CreateEmployeeDto)`
    - `findAll(locationId?: string)`
    - `findByLocation(locationId: string)`
    - `findByEmployeeCode(code: string)`
    - `findOne(id: string)`
    - `update(id: string, dto: UpdateEmployeeDto)`
    - `deactivate(id: string)`
  - **Estimated Time**: 2 hours
  - **Files**: `employees.service.ts`

- [ ] **Task 9.2**: Employee DTOs
  - [ ] Create `dto/create-employee.dto.ts`:
    - `userId` (UUID, required, must exist)
    - `employeeCode` (string, unique, required)
    - `firstName`, `lastName` (required)
    - `phone` (optional, pattern validation)
    - `locationId` (UUID, required)
    - `reportingToId` (UUID, optional)
    - `hireDate` (date, required)
  - [ ] Create `dto/update-employee.dto.ts`
  - [ ] Create validation: user cannot be linked to multiple employees
  - **Estimated Time**: 1.5 hours
  - **Files**: `dto/*.dto.ts`

- [ ] **Task 9.3**: Employee Controller & Module
  - [ ] Create `employees.controller.ts`:
    - `POST /api/v1/employees` (@Roles('ADMIN'))
    - `GET /api/v1/employees` (Manager+, location-scoped)
    - `GET /api/v1/employees/:id` (Self or Manager+)
    - `PATCH /api/v1/employees/:id` (Admin+)
    - `DELETE /api/v1/employees/:id` (Admin+)
  - [ ] Create `employees.module.ts`
  - [ ] Register in `app.module.ts`
  - **Estimated Time**: 2 hours
  - **Files**: `employees.controller.ts`, `employees.module.ts`

#### **Day 10: API Documentation & Testing**
- [ ] **Task 10.1**: Swagger API Documentation
  - [ ] Install `@nestjs/swagger`
  - [ ] Configure Swagger in `main.ts`
  - [ ] Add `@ApiTags()` to all controllers
  - [ ] Add `@ApiOperation()` descriptions
  - [ ] Add `@ApiResponse()` decorators
  - [ ] Add DTO example values with `@ApiProperty()`
  - [ ] Add JWT Bearer authentication scheme
  - [ ] Test Swagger UI at `http://localhost:4000/api`
  - **Estimated Time**: 3 hours
  - **Files**: `main.ts`, all controllers and DTOs

- [ ] **Task 10.2**: Comprehensive API Testing
  - [ ] Test all Company endpoints
  - [ ] Test all Location endpoints with hierarchy validation
  - [ ] Test all User endpoints with role restrictions
  - [ ] Test all Employee endpoints
  - [ ] Test location scope filtering works correctly
  - [ ] Verify audit logging for sensitive operations
  - [ ] Test error responses (400, 401, 403, 404)
  - **Estimated Time**: 3 hours
  - **Tools**: Postman + automated tests

---

## Acceptance Criteria

### **Must Have (Sprint Blocker)**
- [ ] PostgreSQL running and accessible
- [ ] All Prisma migrations executed successfully
- [ ] Seed data script populates database with test data
- [ ] Login returns valid JWT token
- [ ] JWT authentication works on all protected endpoints
- [ ] Company CRUD operations functional
- [ ] Location CRUD with hierarchy validation
- [ ] User management with location scope assignment
- [ ] Employee profile management
- [ ] Role-based authorization working (Super Admin vs Cashier)
- [ ] Location-scoped authorization working (Manager sees only their store)
- [ ] Swagger API documentation accessible

### **Should Have (Important)**
- [ ] Postman/Thunder Client collection with all endpoints
- [ ] Audit logging interceptor capturing key operations
- [ ] Password change flow working
- [ ] User deactivation working
- [ ] Location soft-delete with validation
- [ ] All API endpoints return proper error messages

### **Nice to Have (Stretch Goals)**
- [ ] Unit tests for services (>60% coverage)
- [ ] Integration tests for auth flow
- [ ] API response time <200ms for simple queries
- [ ] Database indexes verified with EXPLAIN queries
- [ ] Logging configured (Winston/Pino)

---

## Deliverables Checklist

- [ ] **Environment Files**: `.env`, `apps/api/.env`, `apps/web/.env`
- [ ] **Database**: PostgreSQL running, migrations applied, seed data loaded
- [ ] **Backend Modules**: Company, Location, User, Employee fully implemented
- [ ] **API Endpoints**: 25+ endpoints functional and tested
- [ ] **Authentication**: Login, refresh token, JWT guards working
- [ ] **Authorization**: RBAC + Location scope enforced
- [ ] **Documentation**: Swagger UI, API collection, updated README
- [ ] **Testing**: Postman collection with 30+ test cases
- [ ] **Code Quality**: ESLint passing, no TypeScript errors

---

## Known Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| PostgreSQL connection issues | High | Document troubleshooting steps; provide fallback local setup |
| Prisma migration conflicts | Medium | Keep migrations atomic; test rollback procedures |
| JWT secret not secure | High | Generate strong secrets; document rotation procedure |
| Location hierarchy logic complex | Medium | Write comprehensive unit tests; diagram state machine |
| Authorization too restrictive | Medium | Start permissive, tighten progressively; log denied access |
| Seed data script fails | Low | Wrap in transaction; validate data before insert |

---

## Definition of Done

A task is considered **Done** when:
1. ✅ Code written and passes TypeScript compilation
2. ✅ Code reviewed (self-review minimum)
3. ✅ API endpoint tested via Postman/curl
4. ✅ Error cases tested (400, 401, 403, 404)
5. ✅ Swagger documentation added
6. ✅ No ESLint errors
7. ✅ Committed to version control with descriptive message
8. ✅ Works in integration with other modules

---

## Daily Standup Template

**What I completed yesterday**:
- 

**What I'm working on today**:
- 

**Blockers**:
- 

---

## Resources & References

- **Prisma Docs**: https://www.prisma.io/docs
- **NestJS Docs**: https://docs.nestjs.com
- **JWT Best Practices**: https://jwt.io/introduction
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Project Docs**: `ARCHITECTURE.md`, `ROADMAP.md`, `README.md`

---

## Sprint Retrospective (End of Sprint)

**What went well**:
- 

**What could be improved**:
- 

**Action items for next sprint**:
- 

---

**Sprint Start Date**: ___________  
**Sprint End Date**: ___________  
**Sprint Owner**: ___________
