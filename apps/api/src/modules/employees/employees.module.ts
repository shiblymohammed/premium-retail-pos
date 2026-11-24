import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

import { StaffRecordsController } from './staff-records.controller';
import { StaffRecordsService } from './staff-records.service';

@Module({
  imports: [UsersModule],
  controllers: [EmployeesController, StaffRecordsController],
  providers: [EmployeesService, StaffRecordsService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
