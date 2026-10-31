import { PrismaClient, Role, LocationType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create default company
  const company = await prisma.company.upsert({
    where: { id: 'seed-company-001' },
    update: {},
    create: {
      id: 'seed-company-001',
      name: 'Premium Retail',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      invoicePrefix: 'INV',
    },
  });
  console.log(`✅ Company: ${company.name}`);

  // 2. Create main warehouse
  const mainWarehouse = await prisma.location.upsert({
    where: { id: 'seed-location-main' },
    update: {},
    create: {
      id: 'seed-location-main',
      companyId: company.id,
      name: 'Main Warehouse',
      type: LocationType.MAIN_WAREHOUSE,
      address: 'Central Distribution Hub',
    },
  });
  console.log(`✅ Location: ${mainWarehouse.name}`);

  // 3. Create a sample sub-warehouse
  const subWarehouse = await prisma.location.upsert({
    where: { id: 'seed-location-sub-01' },
    update: {},
    create: {
      id: 'seed-location-sub-01',
      companyId: company.id,
      name: 'Sub-Warehouse North',
      type: LocationType.SUB_WAREHOUSE,
      parentId: mainWarehouse.id,
      address: 'North Region Warehouse',
    },
  });
  console.log(`✅ Location: ${subWarehouse.name}`);

  // 4. Create a sample retail store
  const retailStore = await prisma.location.upsert({
    where: { id: 'seed-location-store-01' },
    update: {},
    create: {
      id: 'seed-location-store-01',
      companyId: company.id,
      name: 'Retail Store Downtown',
      type: LocationType.RETAIL_STORE,
      parentId: subWarehouse.id,
      address: 'Downtown Shopping District',
      latitude: 12.9716,
      longitude: 77.5946,
      geofenceRadius: 50,
    },
  });
  console.log(`✅ Location: ${retailStore.name}`);

  // 5. Create Super Admin user
  const superAdminPassword = await bcrypt.hash('SuperAdmin@123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@premiumretail.com' },
    update: {},
    create: {
      email: 'admin@premiumretail.com',
      passwordHash: superAdminPassword,
      role: Role.SUPER_ADMIN,
    },
  });
  console.log(`✅ Super Admin: ${superAdmin.email}`);

  // 6. Create a sample Store Manager with location scope
  const managerPassword = await bcrypt.hash('Manager@123', 12);
  const storeManager = await prisma.user.upsert({
    where: { email: 'manager@premiumretail.com' },
    update: {},
    create: {
      email: 'manager@premiumretail.com',
      passwordHash: managerPassword,
      role: Role.STORE_MANAGER,
      locationScopes: {
        create: [{ locationId: retailStore.id }],
      },
    },
  });
  console.log(`✅ Store Manager: ${storeManager.email} (scoped to ${retailStore.name})`);

  // 7. Create a sample Cashier with location scope
  const cashierPassword = await bcrypt.hash('Cashier@123', 12);
  const cashier = await prisma.user.upsert({
    where: { email: 'cashier@premiumretail.com' },
    update: {},
    create: {
      email: 'cashier@premiumretail.com',
      passwordHash: cashierPassword,
      role: Role.CASHIER,
      locationScopes: {
        create: [{ locationId: retailStore.id }],
      },
    },
  });
  console.log(`✅ Cashier: ${cashier.email} (scoped to ${retailStore.name})`);

  console.log('\n🎉 Seed complete! Development credentials:');
  console.log('  Super Admin : admin@premiumretail.com / SuperAdmin@123');
  console.log('  Store Mgr   : manager@premiumretail.com / Manager@123');
  console.log('  Cashier     : cashier@premiumretail.com / Cashier@123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
