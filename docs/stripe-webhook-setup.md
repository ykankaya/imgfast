# Stripe Webhook Setup Guide

This document describes how to set up and configure Stripe webhooks for the ImageCDN platform.

## Overview

The ImageCDN platform uses Stripe webhooks to handle:
- Subscription lifecycle events (created, updated, cancelled)
- Payment events (succeeded, failed)
- Invoice events (created, finalized, upcoming)
- Customer events (created, updated, deleted)

## Webhook Endpoint

```
POST /webhooks/stripe
```

## Required Environment Variables

```env
STRIPE_SECRET_KEY=sk_live_xxx or sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

## Setting Up Webhooks in Stripe Dashboard

### 1. Access Webhook Settings

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers** → **Webhooks**
3. Click **Add endpoint**

### 2. Configure Endpoint

- **Endpoint URL**: `https://api.yourdomain.com/webhooks/stripe`
- **Description**: ImageCDN Billing Webhooks
- **API Version**: Use latest (or lock to specific version)

### 3. Select Events

Select the following events:

#### Checkout Events
- `checkout.session.completed`
- `checkout.session.expired`

#### Subscription Events
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `customer.subscription.trial_will_end`

#### Invoice Events
- `invoice.created`
- `invoice.finalized`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `invoice.upcoming`
- `invoice.finalization_failed`

#### Payment Events
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

#### Customer Events
- `customer.created`
- `customer.updated`
- `customer.deleted`

#### Payment Method Events
- `payment_method.attached`
- `payment_method.detached`

### 4. Get Webhook Secret

After creating the endpoint, copy the **Signing secret** (starts with `whsec_`) and add it to your environment variables.

## Local Development Testing

### Using Stripe CLI

1. Install Stripe CLI:
   ```bash
   # macOS
   brew install stripe/stripe-cli/stripe

   # Windows
   scoop install stripe

   # Linux
   # Download from https://stripe.com/docs/stripe-cli
   ```

2. Login to Stripe:
   ```bash
   stripe login
   ```

3. Forward webhooks to local server:
   ```bash
   stripe listen --forward-to localhost:3000/webhooks/stripe
   ```

4. Copy the webhook signing secret displayed and update your `.env`:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```

5. Trigger test events:
   ```bash
   # Trigger a specific event
   stripe trigger checkout.session.completed

   # Trigger payment succeeded
   stripe trigger payment_intent.succeeded

   # Trigger subscription events
   stripe trigger customer.subscription.created
   stripe trigger customer.subscription.updated
   stripe trigger customer.subscription.deleted
   ```

## Event Processing Flow

```
┌─────────────────┐
│  Stripe Event   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Signature       │
│ Verification    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Idempotency     │
│ Check           │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Event Handler   │
│ (by type)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Update Database │
│ Send Notifs     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Mark Processed  │
│ Return 200      │
└─────────────────┘
```

## Handled Events Reference

### checkout.session.completed
- **Purpose**: Complete subscription setup after successful checkout
- **Actions**:
  - Update customer's Stripe IDs
  - Update customer's plan
  - Set status to active
  - Send welcome notification

### customer.subscription.updated
- **Purpose**: Handle subscription changes
- **Actions**:
  - Handle status changes (active, past_due, unpaid, canceled)
  - Detect plan upgrades/downgrades
  - Update customer plan in database
  - Send appropriate notifications

### invoice.payment_failed
- **Purpose**: Handle failed payments
- **Actions**:
  - Send payment failure notification
  - After 3 failed attempts: suspend account
  - Log for monitoring

### invoice.payment_succeeded
- **Purpose**: Handle successful payments
- **Actions**:
  - Reactivate suspended accounts
  - Send payment confirmation
  - Generate receipt

### invoice.upcoming
- **Purpose**: Prepare next invoice
- **Actions**:
  - Calculate usage-based charges
  - Add overage line items
  - Send upcoming invoice notification

## Usage-Based Billing

For metered billing, usage is reported to Stripe when:

1. **invoice.upcoming** event fires (3 days before billing)
2. **Manually** via admin action
3. **Scheduled job** at end of billing period

### Overage Pricing (Default)

| Plan       | Requests (per 1000) | Bandwidth (per GB) |
|------------|--------------------|--------------------|
| Free       | $0.50              | $0.15              |
| Starter    | $0.40              | $0.12              |
| Pro        | $0.30              | $0.10              |
| Enterprise | $0.20              | $0.08              |

## Error Handling

### Retryable Errors
- Network timeouts
- Database connection errors
- Rate limiting

For retryable errors, return HTTP 503 to trigger Stripe retry.

### Non-Retryable Errors
- Invalid event data
- Business logic errors
- Already processed events

For non-retryable errors, return HTTP 200 to acknowledge receipt.

## Monitoring

### Health Check Endpoint
```
GET /webhooks/health
```

### Event Status Endpoint (Admin)
```
GET /webhooks/events
```

Returns:
- Total events processed
- Failed events
- Pending events
- Recent event list

## Security Considerations

1. **Always verify signatures** - Never process unsigned webhooks
2. **Use HTTPS** - Stripe only sends to HTTPS endpoints in production
3. **Idempotency** - Handle duplicate events gracefully
4. **Timing** - Process webhooks quickly (<30 seconds)
5. **Raw body** - Preserve raw body for signature verification

## NestJS Configuration

Ensure raw body parsing is enabled for webhook routes:

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  
  // ... rest of config
  
  await app.listen(3000);
}
bootstrap();
```

## Testing Webhooks

### Unit Tests
```typescript
describe('WebhooksService', () => {
  it('should process checkout.session.completed', async () => {
    const event = createMockEvent('checkout.session.completed', {
      metadata: { customerId: 'cust_123', planId: 'pro' },
      customer: 'cus_stripe_123',
      subscription: 'sub_123',
    });
    
    const result = await service.processEvent(event);
    expect(result.success).toBe(true);
  });
});
```

### Integration Tests
Use Stripe CLI to send real test events:
```bash
stripe trigger checkout.session.completed --add checkout_session:metadata[customerId]=cust_123
```

## Troubleshooting

### "Invalid signature" errors
- Ensure webhook secret is correct
- Check raw body is being passed (not parsed JSON)
- Verify endpoint URL matches exactly

### Events not being received
- Check Stripe Dashboard for failed deliveries
- Verify endpoint is publicly accessible
- Check firewall/security group rules

### Duplicate processing
- Ensure idempotency check is working
- Check event storage (Redis/database)
- Verify event ID is being tracked

## Resources

- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)
- [Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [Testing Webhooks](https://stripe.com/docs/webhooks/test)
