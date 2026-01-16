import { Module, forwardRef } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { MeteredBillingService } from './metered-billing.service';
import { CustomersModule } from '../customers/customers.module';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [CustomersModule, forwardRef(() => UsageModule)],
  controllers: [BillingController],
  providers: [BillingService, MeteredBillingService],
  exports: [BillingService, MeteredBillingService],
})
export class BillingModule {}
