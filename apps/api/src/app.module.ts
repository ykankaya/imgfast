import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { BillingModule } from './modules/billing/billing.module';
import { ImagesModule } from './modules/images/images.module';
import { UsageModule } from './modules/usage/usage.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { InternalModule } from './modules/internal/internal.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 50,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 200,
      },
    ]),

    // Database
    PrismaModule,

    // Feature modules
    HealthModule,
    AuthModule,
    CustomersModule,
    BillingModule,
    ImagesModule,
    UsageModule,
    WebhooksModule,
    InternalModule,
  ],
})
export class AppModule {}
