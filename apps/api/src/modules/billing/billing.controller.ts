import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CustomersService } from '../customers/customers.service';

@ApiTags('Billing')
@Controller({ path: 'billing', version: '1' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly customersService: CustomersService
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get available pricing plans' })
  getPlans() {
    return this.billingService.plans;
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Create checkout session for plan upgrade' })
  async createCheckout(
    @CurrentUser() user: any,
    @Body() body: { planId: string; interval: 'month' | 'year' }
  ) {
    return this.billingService.createCheckoutSession(
      user.customerId,
      body.planId,
      body.interval
    );
  }

  @Post('portal')
  @ApiOperation({ summary: 'Create Stripe customer portal session' })
  async createPortal(@CurrentUser() user: any) {
    const customer = await this.customersService.findById(user.customerId);
    if (!customer?.stripeCustomerId) {
      throw new Error('No billing account found');
    }

    return this.billingService.createPortalSession(customer.stripeCustomerId);
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Get current subscription details' })
  async getSubscription(@CurrentUser() user: any) {
    const customer = await this.customersService.findById(user.customerId);
    if (!customer?.stripeSubscriptionId) {
      return { subscription: null, plan: this.billingService.getPlan('free') };
    }

    const subscription = await this.billingService.getSubscription(
      customer.stripeSubscriptionId
    );

    return {
      subscription: {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      plan: customer.plan,
    };
  }
}
