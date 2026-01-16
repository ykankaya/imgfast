import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { CustomersService } from '../customers/customers.service';
import { BillingService } from '../billing/billing.service';
import { UsageService } from '../usage/usage.service';

/**
 * Webhook event record for idempotency and logging
 */
export interface WebhookEventRecord {
  id: string;
  type: string;
  processedAt: Date;
  status: 'pending' | 'processed' | 'failed';
  error?: string;
  retryCount: number;
}

/**
 * Subscription change details for notifications
 */
export interface SubscriptionChange {
  customerId: string;
  previousPlan?: string;
  newPlan: string;
  changeType: 'upgrade' | 'downgrade' | 'cancel' | 'reactivate';
  effectiveDate: Date;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private stripe: Stripe;

  // In-memory store for processed events (use Redis in production)
  private processedEvents: Map<string, WebhookEventRecord> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly customersService: CustomersService,
    private readonly billingService: BillingService,
    private readonly usageService: UsageService
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    }
  }

  /**
   * Verify Stripe webhook signature
   */
  verifyWebhookSignature(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  /**
   * Check if event has already been processed (idempotency)
   */
  async isEventProcessed(eventId: string): Promise<boolean> {
    const record = this.processedEvents.get(eventId);
    return record?.status === 'processed';
  }

  /**
   * Mark event as being processed
   */
  async markEventPending(eventId: string, eventType: string): Promise<void> {
    this.processedEvents.set(eventId, {
      id: eventId,
      type: eventType,
      processedAt: new Date(),
      status: 'pending',
      retryCount: 0,
    });
  }

  /**
   * Mark event as successfully processed
   */
  async markEventProcessed(eventId: string): Promise<void> {
    const record = this.processedEvents.get(eventId);
    if (record) {
      record.status = 'processed';
      record.processedAt = new Date();
    }
  }

  /**
   * Mark event as failed
   */
  async markEventFailed(eventId: string, error: string): Promise<void> {
    const record = this.processedEvents.get(eventId);
    if (record) {
      record.status = 'failed';
      record.error = error;
      record.retryCount++;
    }
  }

  /**
   * Process Stripe webhook event
   */
  async processEvent(event: Stripe.Event): Promise<{ success: boolean; message: string }> {
    this.logger.log(`Processing Stripe event: ${event.type} (${event.id})`);

    // Check idempotency
    if (await this.isEventProcessed(event.id)) {
      this.logger.log(`Event ${event.id} already processed, skipping`);
      return { success: true, message: 'Event already processed' };
    }

    await this.markEventPending(event.id, event.type);

    try {
      switch (event.type) {
        // Checkout events
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case 'checkout.session.expired':
          await this.handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
          break;

        // Subscription lifecycle events
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.paused':
          await this.handleSubscriptionPaused(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.resumed':
          await this.handleSubscriptionResumed(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.trial_will_end':
          await this.handleTrialWillEnd(event.data.object as Stripe.Subscription);
          break;

        // Invoice events
        case 'invoice.created':
          await this.handleInvoiceCreated(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.finalized':
          await this.handleInvoiceFinalized(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.upcoming':
          await this.handleInvoiceUpcoming(event.data.object as Stripe.Invoice);
          break;

        // Payment intent events
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        // Customer events
        case 'customer.created':
          await this.handleCustomerCreated(event.data.object as Stripe.Customer);
          break;

        case 'customer.updated':
          await this.handleCustomerUpdated(event.data.object as Stripe.Customer);
          break;

        case 'customer.deleted':
          await this.handleCustomerDeleted(event.data.object as Stripe.Customer);
          break;

        // Payment method events
        case 'payment_method.attached':
          await this.handlePaymentMethodAttached(event.data.object as Stripe.PaymentMethod);
          break;

        case 'payment_method.detached':
          await this.handlePaymentMethodDetached(event.data.object as Stripe.PaymentMethod);
          break;

        // Usage record events (for metered billing)
        case 'invoice.finalization_failed':
          await this.handleInvoiceFinalizationFailed(event.data.object as Stripe.Invoice);
          break;

        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
      }

      await this.markEventProcessed(event.id);
      return { success: true, message: `Processed ${event.type}` };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to process event ${event.id}: ${errorMessage}`);
      await this.markEventFailed(event.id, errorMessage);
      throw error;
    }
  }

  // ==================== Checkout Handlers ====================

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    this.logger.log(`Checkout completed: ${session.id}`);

    const customerId = session.metadata?.customerId;
    const planId = session.metadata?.planId;

    if (!customerId || !planId) {
      this.logger.error('Missing metadata in checkout session');
      return;
    }

    const plan = this.billingService.getPlan(planId);
    if (!plan) {
      this.logger.error(`Invalid plan ID: ${planId}`);
      return;
    }

    // Update customer with Stripe IDs and new plan
    await this.customersService.update(customerId, {
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: session.subscription as string,
      plan: {
        id: plan.id,
        name: plan.name,
        tier: plan.tier,
      },
      status: 'active',
    });

    this.logger.log(`Customer ${customerId} upgraded to ${plan.name}`);

    // Send welcome email / notification
    await this.sendNotification(customerId, 'plan_upgraded', {
      planName: plan.name,
      features: plan.features,
    });
  }

  private async handleCheckoutExpired(session: Stripe.Checkout.Session): Promise<void> {
    this.logger.log(`Checkout expired: ${session.id}`);

    const customerId = session.metadata?.customerId;
    if (customerId) {
      // Optionally send reminder email
      await this.sendNotification(customerId, 'checkout_expired', {
        sessionId: session.id,
      });
    }
  }

  // ==================== Subscription Handlers ====================

  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription created: ${subscription.id}`);

    const customer = await this.findCustomerByStripeId(subscription.customer as string);
    if (!customer) return;

    // Get plan from subscription items
    const priceId = subscription.items.data[0]?.price.id;
    const plan = this.getPlanByPriceId(priceId);

    if (plan) {
      await this.customersService.update(customer.id, {
        stripeSubscriptionId: subscription.id,
        plan: {
          id: plan.id,
          name: plan.name,
          tier: plan.tier,
        },
      });
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription updated: ${subscription.id}, status: ${subscription.status}`);

    const customer = await this.findCustomerByStripeId(subscription.customer as string);
    if (!customer) return;

    // Handle status changes
    switch (subscription.status) {
      case 'active':
        if (customer.status !== 'active') {
          await this.customersService.updateStatus(customer.id, 'active');
          await this.sendNotification(customer.id, 'subscription_reactivated', {});
        }
        break;

      case 'past_due':
        this.logger.warn(`Subscription ${subscription.id} is past due`);
        await this.sendNotification(customer.id, 'payment_past_due', {
          dueDate: new Date(subscription.current_period_end * 1000),
        });
        break;

      case 'unpaid':
        await this.customersService.updateStatus(customer.id, 'suspended');
        await this.sendNotification(customer.id, 'account_suspended', {
          reason: 'unpaid_invoice',
        });
        break;

      case 'canceled':
        await this.handleSubscriptionCancellation(customer, subscription);
        break;

      case 'incomplete':
      case 'incomplete_expired':
        this.logger.warn(`Subscription ${subscription.id} is incomplete`);
        break;

      case 'trialing':
        this.logger.log(`Subscription ${subscription.id} is in trial`);
        break;
    }

    // Check for plan changes
    const priceId = subscription.items.data[0]?.price.id;
    const newPlan = this.getPlanByPriceId(priceId);

    if (newPlan && newPlan.id !== customer.plan.id) {
      const changeType = this.getChangeType(customer.plan.tier, newPlan.tier);

      await this.customersService.update(customer.id, {
        plan: {
          id: newPlan.id,
          name: newPlan.name,
          tier: newPlan.tier,
        },
      });

      await this.sendNotification(customer.id, `plan_${changeType}`, {
        previousPlan: customer.plan.name,
        newPlan: newPlan.name,
      });

      this.logger.log(
        `Customer ${customer.id} ${changeType} from ${customer.plan.name} to ${newPlan.name}`
      );
    }
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription deleted: ${subscription.id}`);

    const customer = await this.findCustomerByStripeId(subscription.customer as string);
    if (!customer) return;

    await this.handleSubscriptionCancellation(customer, subscription);
  }

  private async handleSubscriptionPaused(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription paused: ${subscription.id}`);

    const customer = await this.findCustomerByStripeId(subscription.customer as string);
    if (!customer) return;

    await this.customersService.updateStatus(customer.id, 'suspended');
    await this.sendNotification(customer.id, 'subscription_paused', {});
  }

  private async handleSubscriptionResumed(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Subscription resumed: ${subscription.id}`);

    const customer = await this.findCustomerByStripeId(subscription.customer as string);
    if (!customer) return;

    await this.customersService.updateStatus(customer.id, 'active');
    await this.sendNotification(customer.id, 'subscription_resumed', {});
  }

  private async handleTrialWillEnd(subscription: Stripe.Subscription): Promise<void> {
    this.logger.log(`Trial ending for subscription: ${subscription.id}`);

    const customer = await this.findCustomerByStripeId(subscription.customer as string);
    if (!customer) return;

    const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

    await this.sendNotification(customer.id, 'trial_ending', {
      trialEndDate: trialEnd,
      daysRemaining: trialEnd
        ? Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 0,
    });
  }

  private async handleSubscriptionCancellation(
    customer: any,
    subscription: Stripe.Subscription
  ): Promise<void> {
    // Downgrade to free plan
    const freePlan = this.billingService.getPlan('free')!;

    await this.customersService.update(customer.id, {
      stripeSubscriptionId: undefined,
      plan: {
        id: freePlan.id,
        name: freePlan.name,
        tier: freePlan.tier,
      },
    });

    await this.sendNotification(customer.id, 'subscription_cancelled', {
      effectiveDate: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : new Date(),
    });

    this.logger.log(`Customer ${customer.id} downgraded to free plan`);
  }

  // ==================== Invoice Handlers ====================

  private async handleInvoiceCreated(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice created: ${invoice.id}`);

    // Add usage-based line items if applicable
    if (invoice.subscription) {
      await this.addUsageLineItems(invoice);
    }
  }

  private async handleInvoiceFinalized(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice finalized: ${invoice.id}, amount: ${invoice.amount_due / 100}`);
  }

  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Invoice payment succeeded: ${invoice.id}`);

    const customer = await this.findCustomerByStripeId(invoice.customer as string);
    if (!customer) return;

    // Reactivate if suspended
    if (customer.status === 'suspended') {
      await this.customersService.updateStatus(customer.id, 'active');
      this.logger.log(`Customer ${customer.id} reactivated after payment`);
    }

    await this.sendNotification(customer.id, 'payment_succeeded', {
      amount: invoice.amount_paid / 100,
      invoiceUrl: invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null,
      receiptUrl: (invoice as any).receipt_url ?? null,
    });
  }

  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    this.logger.error(`Invoice payment failed: ${invoice.id}`);

    const customer = await this.findCustomerByStripeId(invoice.customer as string);
    if (!customer) return;

    const attemptCount = invoice.attempt_count || 0;

    await this.sendNotification(customer.id, 'payment_failed', {
      amount: invoice.amount_due / 100,
      attemptCount,
      nextAttempt: invoice.next_payment_attempt
        ? new Date(invoice.next_payment_attempt * 1000)
        : null,
    });

    // Suspend after 3 failed attempts
    if (attemptCount >= 3) {
      await this.customersService.updateStatus(customer.id, 'suspended');
      await this.sendNotification(customer.id, 'account_suspended', {
        reason: 'payment_failed',
      });
      this.logger.warn(
        `Customer ${customer.id} suspended after ${attemptCount} failed payment attempts`
      );
    }
  }

  private async handleInvoiceUpcoming(invoice: Stripe.Invoice): Promise<void> {
    this.logger.log(`Upcoming invoice for customer: ${invoice.customer}`);

    const customer = await this.findCustomerByStripeId(invoice.customer as string);
    if (!customer) return;

    // Add usage charges before the invoice is finalized
    await this.addUsageLineItems(invoice);

    await this.sendNotification(customer.id, 'invoice_upcoming', {
      amount: invoice.amount_due / 100,
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
    });
  }

  private async handleInvoiceFinalizationFailed(invoice: Stripe.Invoice): Promise<void> {
    this.logger.error(`Invoice finalization failed: ${invoice.id}`);
    // Handle finalization failure - retry or alert
  }

  // ==================== Payment Intent Handlers ====================

  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    this.logger.log(`Payment intent succeeded: ${paymentIntent.id}`);
  }

  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    this.logger.error(`Payment intent failed: ${paymentIntent.id}`);
    const error = paymentIntent.last_payment_error;
    if (error) {
      this.logger.error(`Payment error: ${error.message} (${error.code})`);
    }
  }

  // ==================== Customer Handlers ====================

  private async handleCustomerCreated(stripeCustomer: Stripe.Customer): Promise<void> {
    this.logger.log(`Stripe customer created: ${stripeCustomer.id}`);
  }

  private async handleCustomerUpdated(stripeCustomer: Stripe.Customer): Promise<void> {
    this.logger.log(`Stripe customer updated: ${stripeCustomer.id}`);

    // Sync email changes
    const customer = await this.findCustomerByStripeId(stripeCustomer.id);
    if (customer && stripeCustomer.email && stripeCustomer.email !== customer.email) {
      await this.customersService.update(customer.id, {
        email: stripeCustomer.email,
      });
    }
  }

  private async handleCustomerDeleted(stripeCustomer: Stripe.Customer): Promise<void> {
    this.logger.log(`Stripe customer deleted: ${stripeCustomer.id}`);

    const customer = await this.findCustomerByStripeId(stripeCustomer.id);
    if (customer) {
      await this.customersService.updateStatus(customer.id, 'cancelled');
    }
  }

  // ==================== Payment Method Handlers ====================

  private async handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod): Promise<void> {
    this.logger.log(`Payment method attached: ${paymentMethod.id}`);
  }

  private async handlePaymentMethodDetached(paymentMethod: Stripe.PaymentMethod): Promise<void> {
    this.logger.log(`Payment method detached: ${paymentMethod.id}`);
  }

  // ==================== Helper Methods ====================

  private async findCustomerByStripeId(stripeCustomerId: string) {
    const customer = await this.customersService.findByStripeCustomerId(stripeCustomerId);
    if (!customer) {
      this.logger.error(`Customer not found for Stripe ID: ${stripeCustomerId}`);
    }
    return customer;
  }

  private getPlanByPriceId(
    priceId: string | undefined
  ): ReturnType<typeof this.billingService.getPlan> {
    if (!priceId) return undefined;

    return this.billingService.plans.find(
      p => p.stripePriceIdMonthly === priceId || p.stripePriceIdYearly === priceId
    );
  }

  private getChangeType(oldTier: string, newTier: string): 'upgrade' | 'downgrade' | 'change' {
    const tiers = ['free', 'starter', 'pro', 'enterprise'];
    const oldIndex = tiers.indexOf(oldTier);
    const newIndex = tiers.indexOf(newTier);

    if (newIndex > oldIndex) return 'upgrade';
    if (newIndex < oldIndex) return 'downgrade';
    return 'change';
  }

  /**
   * Add usage-based line items to invoice
   */
  private async addUsageLineItems(invoice: Stripe.Invoice): Promise<void> {
    const customer = await this.findCustomerByStripeId(invoice.customer as string);
    if (!customer) return;

    // Get usage for the billing period
    const usage = await this.usageService.getCurrentMonthUsage(customer.id);
    const plan = this.billingService.getPlan(customer.plan.id);

    if (!plan) return;

    // Calculate overage
    const requestsOverage = Math.max(0, usage.requests - plan.features.requestsPerMonth);
    const bandwidthOverageGB = Math.max(
      0,
      usage.bandwidth / (1024 * 1024 * 1024) - plan.features.bandwidthPerMonth
    );

    // Add overage charges if applicable
    // In production, use Stripe Usage Records for metered billing
    if (requestsOverage > 0) {
      this.logger.log(`Customer ${customer.id} has ${requestsOverage} request overage`);
      // await this.stripe.invoiceItems.create({ ... });
    }

    if (bandwidthOverageGB > 0) {
      this.logger.log(
        `Customer ${customer.id} has ${bandwidthOverageGB.toFixed(2)}GB bandwidth overage`
      );
      // await this.stripe.invoiceItems.create({ ... });
    }
  }

  /**
   * Send notification (placeholder - implement with email service)
   */
  private async sendNotification(
    customerId: string,
    type: string,
    data: Record<string, any>
  ): Promise<void> {
    this.logger.log(`Notification: ${type} for customer ${customerId}`, data);
    // In production, integrate with email service (SendGrid, Postmark, etc.)
  }

  /**
   * Get processed events for monitoring
   */
  getProcessedEvents(): WebhookEventRecord[] {
    return Array.from(this.processedEvents.values());
  }

  /**
   * Get failed events for retry
   */
  getFailedEvents(): WebhookEventRecord[] {
    return Array.from(this.processedEvents.values()).filter(e => e.status === 'failed');
  }
}
