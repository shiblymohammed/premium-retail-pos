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
import { InventoryModule } from './modules/inventory/inventory.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { PosModule } from './modules/pos/pos.module';
import { SalesModule } from './modules/sales/sales.module';

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
    InventoryModule,
    TransfersModule,
    PosModule,
    SalesModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: AuditLoggingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
