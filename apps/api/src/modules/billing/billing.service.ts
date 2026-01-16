import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export interface PricingPlan {
  id: string;
  name: string;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  priceMonthly: number;
  priceYearly: number;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  features: {
    requestsPerMonth: number;
    bandwidthPerMonth: number; // in GB
    maxImageWidth: number;
    maxImageHeight: number;
    maxFileSize: number; // in MB
    customDomains: boolean;
    signedUrls: boolean;
    avifSupport: boolean;
    removeWatermark: boolean;
    prioritySupport: boolean;
  };
}

@Injectable()
export class BillingService {
  private stripe: Stripe;

  readonly plans: PricingPlan[] = [
    {
      id: 'free',
      name: 'Free',
      tier: 'free',
      priceMonthly: 0,
      priceYearly: 0,
      features: {
        requestsPerMonth: 10000,
        bandwidthPerMonth: 1,
        maxImageWidth: 2048,
        maxImageHeight: 2048,
        maxFileSize: 10,
        customDomains: false,
        signedUrls: false,
        avifSupport: false,
        removeWatermark: false,
        prioritySupport: false,
      },
    },
    {
      id: 'starter',
      name: 'Starter',
      tier: 'starter',
      priceMonthly: 19,
      priceYearly: 190,
      stripePriceIdMonthly: 'price_starter_monthly',
      stripePriceIdYearly: 'price_starter_yearly',
      features: {
        requestsPerMonth: 100000,
        bandwidthPerMonth: 10,
        maxImageWidth: 4096,
        maxImageHeight: 4096,
        maxFileSize: 25,
        customDomains: true,
        signedUrls: false,
        avifSupport: true,
        removeWatermark: true,
        prioritySupport: false,
      },
    },
    {
      id: 'pro',
      name: 'Pro',
      tier: 'pro',
      priceMonthly: 49,
      priceYearly: 490,
      stripePriceIdMonthly: 'price_pro_monthly',
      stripePriceIdYearly: 'price_pro_yearly',
      features: {
        requestsPerMonth: 500000,
        bandwidthPerMonth: 50,
        maxImageWidth: 8192,
        maxImageHeight: 8192,
        maxFileSize: 50,
        customDomains: true,
        signedUrls: true,
        avifSupport: true,
        removeWatermark: true,
        prioritySupport: true,
      },
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      tier: 'enterprise',
      priceMonthly: 199,
      priceYearly: 1990,
      stripePriceIdMonthly: 'price_enterprise_monthly',
      stripePriceIdYearly: 'price_enterprise_yearly',
      features: {
        requestsPerMonth: 5000000,
        bandwidthPerMonth: 500,
        maxImageWidth: 16384,
        maxImageHeight: 16384,
        maxFileSize: 100,
        customDomains: true,
        signedUrls: true,
        avifSupport: true,
        removeWatermark: true,
        prioritySupport: true,
      },
    },
  ];

  constructor(private readonly configService: ConfigService) {
    this.stripe = new Stripe(this.configService.get<string>('STRIPE_SECRET_KEY')!);
  }

  getPlan(planId: string): PricingPlan | undefined {
    return this.plans.find(p => p.id === planId);
  }

  async createCheckoutSession(
    customerId: string,
    planId: string,
    interval: 'month' | 'year'
  ): Promise<{ url: string }> {
    const plan = this.getPlan(planId);
    if (!plan) {
      throw new Error('Invalid plan');
    }

    const priceId = interval === 'month' ? plan.stripePriceIdMonthly : plan.stripePriceIdYearly;
    if (!priceId) {
      throw new Error('Plan not available for purchase');
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${this.configService.get('DASHBOARD_URL')}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.configService.get('DASHBOARD_URL')}/billing/cancel`,
      metadata: {
        customerId,
        planId,
      },
    });

    return { url: session.url! };
  }

  async createPortalSession(stripeCustomerId: string): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${this.configService.get('DASHBOARD_URL')}/billing`,
    });

    return { url: session.url };
  }

  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.cancel(subscriptionId);
  }
}
