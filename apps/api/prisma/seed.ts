import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Bootstrap exactly one global administrator. Organization data and all other
 * users are created later by the authenticated Super Admin through the app.
 * The seed is intentionally idempotent so operators can rotate this password
 * by changing the environment variable and running the seed again.
 */
async function main() {
  const email = process.env.INITIAL_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('Set INITIAL_SUPER_ADMIN_EMAIL and INITIAL_SUPER_ADMIN_PASSWORD before running the database seed.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('INITIAL_SUPER_ADMIN_EMAIL must be a valid email address.');
  }
  if (password.length < 14 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('INITIAL_SUPER_ADMIN_PASSWORD must be at least 14 characters and at most 72 UTF-8 bytes.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== Role.SUPER_ADMIN) {
    throw new Error('The configured bootstrap email already belongs to a non-Super Admin. Choose a different email; no account was changed.');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const superAdmin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      isActive: true,
      refreshTokenHash: null,
      sessionVersion: { increment: 1 },
      locationScopes: { deleteMany: {} },
    },
    create: {
      email,
      passwordHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
    select: { id: true, email: true, role: true },
  });

  console.log(`Super Admin bootstrap ready: ${superAdmin.email} (${superAdmin.role}).`);
  console.log('No company, location, product, employee, or demo accounts were created.');
  console.log('The bootstrap password is not printed.');
}

main()
  .catch((error) => {
    console.error('Super Admin bootstrap failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
