import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LocationsModule } from './modules/locations/locations.module';
import { CompanyModule } from './modules/company/company.module';
import { HealthModule } from './modules/health/health.module';
import { AuditLoggingInterceptor } from './common/interceptors/audit-logging.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EmployeesModule } from './modules/employees/employees.module';
import { ProductsModule } from './modules/products/products.module';

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
    EmployeesModule,
    ProductsModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AuditLoggingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
