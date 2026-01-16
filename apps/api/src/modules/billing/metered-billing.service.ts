import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { UsageService } from '../usage/usage.service';

/**
 * Overage pricing configuration
 */
interface OveragePricing {
  requestsPerThousand: number;  // Price per 1000 requests over limit
  bandwidthPerGB: number;       // Price per GB over limit
}

/**
 * Usage summary for billing
 */
interface BillingUsageSummary {
  period: string;
  requests: {
    used: number;
    included: number;
    overage: number;
    overageCharge: number;
  };
  bandwidth: {
    usedBytes: number;
    usedGB: number;
    includedGB: number;
    overageGB: number;
    overageCharge: number;
  };
  totalOverageCharge: number;
}

/**
 * Metered Billing Service
 *
 * Handles usage-based billing with Stripe:
 * - Tracks usage against plan limits
 * - Reports usage to Stripe for metered billing
 * - Calculates overage charges
 * - Creates invoice line items for overages
 */
@Injectable()
export class MeteredBillingService {
  private readonly logger = new Logger(MeteredBillingService.name);
  private stripe: Stripe;

  // Default overage pricing
  private readonly overagePricing: Record<string, OveragePricing> = {
    free: {
      requestsPerThousand: 0.50,  // $0.50 per 1000 requests
      bandwidthPerGB: 0.15,       // $0.15 per GB
    },
    starter: {
      requestsPerThousand: 0.40,
      bandwidthPerGB: 0.12,
    },
    pro: {
      requestsPerThousand: 0.30,
      bandwidthPerGB: 0.10,
    },
    enterprise: {
      requestsPerThousand: 0.20,
      bandwidthPerGB: 0.08,
    },
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly usageService: UsageService
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    }
  }

  /**
   * Calculate billing summary for a customer
   */
  async calculateBillingSummary(
    customerId: string,
    planTier: string,
    planLimits: { requestsPerMonth: number; bandwidthPerMonth: number }
  ): Promise<BillingUsageSummary> {
    const usage = await this.usageService.getCurrentMonthUsage(customerId);
    const pricing = this.overagePricing[planTier] || this.overagePricing.starter;

    // Calculate requests overage
    const requestsOverage = Math.max(0, usage.requests - planLimits.requestsPerMonth);
    const requestsOverageCharge = (requestsOverage / 1000) * pricing.requestsPerThousand;

    // Calculate bandwidth overage
    const bandwidthUsedGB = usage.bandwidth / (1024 * 1024 * 1024);
    const bandwidthIncludedGB = planLimits.bandwidthPerMonth / (1024 * 1024 * 1024);
    const bandwidthOverageGB = Math.max(0, bandwidthUsedGB - bandwidthIncludedGB);
    const bandwidthOverageCharge = bandwidthOverageGB * pricing.bandwidthPerGB;

    const totalOverageCharge = requestsOverageCharge + bandwidthOverageCharge;

    return {
      period: this.getCurrentPeriod(),
      requests: {
        used: usage.requests,
        included: planLimits.requestsPerMonth,
        overage: requestsOverage,
        overageCharge: Math.round(requestsOverageCharge * 100) / 100,
      },
      bandwidth: {
        usedBytes: usage.bandwidth,
        usedGB: Math.round(bandwidthUsedGB * 100) / 100,
        includedGB: bandwidthIncludedGB,
        overageGB: Math.round(bandwidthOverageGB * 100) / 100,
        overageCharge: Math.round(bandwidthOverageCharge * 100) / 100,
      },
      totalOverageCharge: Math.round(totalOverageCharge * 100) / 100,
    };
  }

  /**
   * Report usage to Stripe for metered subscription items
   * Called periodically or when invoice.upcoming webhook fires
   */
  async reportUsageToStripe(
    subscriptionItemId: string,
    quantity: number,
    timestamp?: number,
    action: 'increment' | 'set' = 'set'
  ): Promise<Stripe.UsageRecord> {
    try {
      const usageRecord = await this.stripe.subscriptionItems.createUsageRecord(
        subscriptionItemId,
        {
          quantity,
          timestamp: timestamp || Math.floor(Date.now() / 1000),
          action,
        }
      );

      this.logger.log(`Reported usage to Stripe: ${quantity} for item ${subscriptionItemId}`);
      return usageRecord;
    } catch (error) {
      this.logger.error(`Failed to report usage to Stripe: ${error}`);
      throw error;
    }
  }

  /**
   * Create overage invoice items
   * Called when billing period ends
   */
  async createOverageInvoiceItems(
    stripeCustomerId: string,
    summary: BillingUsageSummary
  ): Promise<Stripe.InvoiceItem[]> {
    const items: Stripe.InvoiceItem[] = [];

    // Add requests overage if applicable
    if (summary.requests.overage > 0 && summary.requests.overageCharge > 0) {
      const item = await this.stripe.invoiceItems.create({
        customer: stripeCustomerId,
        amount: Math.round(summary.requests.overageCharge * 100), // Convert to cents
        currency: 'usd',
        description: `Overage: ${summary.requests.overage.toLocaleString()} additional requests`,
        metadata: {
          type: 'overage',
          category: 'requests',
          quantity: String(summary.requests.overage),
          period: summary.period,
        },
      });
      items.push(item);
      this.logger.log(`Created requests overage invoice item: $${summary.requests.overageCharge}`);
    }

    // Add bandwidth overage if applicable
    if (summary.bandwidth.overageGB > 0 && summary.bandwidth.overageCharge > 0) {
      const item = await this.stripe.invoiceItems.create({
        customer: stripeCustomerId,
        amount: Math.round(summary.bandwidth.overageCharge * 100),
        currency: 'usd',
        description: `Overage: ${summary.bandwidth.overageGB.toFixed(2)} GB additional bandwidth`,
        metadata: {
          type: 'overage',
          category: 'bandwidth',
          quantity: String(summary.bandwidth.overageGB),
          period: summary.period,
        },
      });
      items.push(item);
      this.logger.log(`Created bandwidth overage invoice item: $${summary.bandwidth.overageCharge}`);
    }

    return items;
  }

  /**
   * Get usage records for a subscription item
   */
  async getUsageRecords(
    subscriptionItemId: string,
    startTime?: number,
    endTime?: number
  ): Promise<Stripe.UsageRecordSummary[]> {
    const summaries = await this.stripe.subscriptionItems.listUsageRecordSummaries(
      subscriptionItemId,
      {
        limit: 100,
      }
    );

    return summaries.data;
  }

  /**
   * Create a metered price for usage-based billing
   */
  async createMeteredPrice(
    productId: string,
    nickname: string,
    unitAmount: number,
    billingScheme: 'per_unit' | 'tiered' = 'per_unit',
    tiers?: Stripe.PriceCreateParams.Tier[]
  ): Promise<Stripe.Price> {
    const params: Stripe.PriceCreateParams = {
      product: productId,
      nickname,
      currency: 'usd',
      recurring: {
        interval: 'month',
        usage_type: 'metered',
        aggregate_usage: 'sum',
      },
      billing_scheme: billingScheme,
    };

    if (billingScheme === 'per_unit') {
      params.unit_amount = unitAmount;
    } else if (billingScheme === 'tiered' && tiers) {
      params.tiers = tiers;
      params.tiers_mode = 'graduated';
    }

    return this.stripe.prices.create(params);
  }

  /**
   * Get estimated bill for current period
   */
  async getEstimatedBill(
    customerId: string,
    stripeSubscriptionId: string,
    planTier: string,
    planLimits: { requestsPerMonth: number; bandwidthPerMonth: number },
    basePlanPrice: number
  ): Promise<{
    basePlanCharge: number;
    estimatedOverageCharge: number;
    estimatedTotal: number;
    breakdown: BillingUsageSummary;
  }> {
    const summary = await this.calculateBillingSummary(customerId, planTier, planLimits);

    return {
      basePlanCharge: basePlanPrice,
      estimatedOverageCharge: summary.totalOverageCharge,
      estimatedTotal: basePlanPrice + summary.totalOverageCharge,
      breakdown: summary,
    };
  }

  /**
   * Set up metered billing products in Stripe
   * Run once during setup
   */
  async setupMeteredBillingProducts(): Promise<{
    requestsProduct: Stripe.Product;
    bandwidthProduct: Stripe.Product;
    requestsPrice: Stripe.Price;
    bandwidthPrice: Stripe.Price;
  }> {
    // Create products
    const requestsProduct = await this.stripe.products.create({
      name: 'ImageCDN Requests',
      description: 'Per-request charges for image transformations',
      metadata: { type: 'metered', unit: 'requests' },
    });

    const bandwidthProduct = await this.stripe.products.create({
      name: 'ImageCDN Bandwidth',
      description: 'Per-GB charges for bandwidth usage',
      metadata: { type: 'metered', unit: 'bandwidth_gb' },
    });

    // Create tiered pricing for requests
    const requestsPrice = await this.createMeteredPrice(
      requestsProduct.id,
      'Requests - Tiered',
      0,
      'tiered',
      [
        { up_to: 100000, unit_amount: 0 },           // First 100k free
        { up_to: 500000, unit_amount: 40 },          // $0.40 per 1000
        { up_to: 1000000, unit_amount: 30 },         // $0.30 per 1000
        { up_to: 'inf', unit_amount: 20 },           // $0.20 per 1000 after
      ]
    );

    // Create per-unit pricing for bandwidth
    const bandwidthPrice = await this.createMeteredPrice(
      bandwidthProduct.id,
      'Bandwidth - Per GB',
      10, // $0.10 per GB
      'per_unit'
    );

    this.logger.log('Metered billing products created in Stripe');

    return {
      requestsProduct,
      bandwidthProduct,
      requestsPrice,
      bandwidthPrice,
    };
  }

  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}
