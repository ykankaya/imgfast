import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { CustomersModule } from '../customers/customers.module';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [CustomersModule, UsageModule],
  controllers: [InternalController],
})
export class InternalModule {}
