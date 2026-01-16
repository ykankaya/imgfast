import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { CustomersModule } from '../customers/customers.module';
import { BillingModule } from '../billing/billing.module';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [CustomersModule, BillingModule, UsageModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
