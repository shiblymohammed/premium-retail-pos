import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LocationsModule } from './modules/locations/locations.module';
import { CompanyModule } from './modules/company/company.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Load environment variables globally
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),

    // Core infrastructure
    PrismaModule,

    // Feature modules — Phase 1
    AuthModule,
    UsersModule,
    CompanyModule,
    LocationsModule,
    HealthModule,
  ],
})
export class AppModule {}
