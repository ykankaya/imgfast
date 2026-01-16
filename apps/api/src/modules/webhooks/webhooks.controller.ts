import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  RawBodyRequest,
  Req,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';

/**
 * Webhook endpoints for external service integrations.
 *
 * Stripe webhooks require raw body access for signature verification.
 * Configure bodyParser to preserve raw body for /webhooks/* routes.
 */
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * Stripe webhook endpoint
   *
   * Receives events from Stripe for:
   * - Subscription lifecycle (created, updated, cancelled)
   * - Payment events (succeeded, failed)
   * - Invoice events (created, finalized, upcoming)
   * - Customer events (created, updated, deleted)
   *
   * @see https://stripe.com/docs/webhooks
   */
  @Post('stripe')
  @ApiExcludeEndpoint()
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string
  ) {
    const startTime = Date.now();

    // Validate signature header exists
    if (!signature) {
      this.logger.warn('Missing Stripe signature header');
      throw new HttpException({ error: 'Missing stripe-signature header' }, HttpStatus.BAD_REQUEST);
    }

    // Get raw body for signature verification
    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error('Raw body not available - check bodyParser configuration');
      throw new HttpException(
        { error: 'Raw body required for webhook verification' },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    // Verify webhook signature
    let event;
    try {
      event = this.webhooksService.verifyWebhookSignature(rawBody, signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signature verification failed';
      this.logger.warn(`Webhook signature verification failed: ${message}`);
      throw new HttpException({ error: 'Invalid webhook signature' }, HttpStatus.BAD_REQUEST);
    }

    // Process the event
    try {
      const result = await this.webhooksService.processEvent(event);

      const processingTime = Date.now() - startTime;
      this.logger.log(`Webhook processed in ${processingTime}ms: ${event.type}`);

      return {
        received: true,
        eventId: event.id,
        eventType: event.type,
        ...result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Webhook processing failed: ${message}`);

      // Return 200 to prevent Stripe retries for non-retryable errors
      // Stripe will retry on 4xx/5xx errors
      if (this.isRetryableError(error)) {
        throw new HttpException(
          { error: 'Temporary processing error', retryable: true },
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }

      // Log but acknowledge for non-retryable errors
      return {
        received: true,
        eventId: event.id,
        eventType: event.type,
        success: false,
        error: message,
      };
    }
  }

  /**
   * Health check for webhook endpoint
   */
  @Get('health')
  @ApiOperation({ summary: 'Check webhook endpoint health' })
  async healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  /**
   * Get recent webhook events (for debugging/monitoring)
   * Protected endpoint - add auth guard in production
   */
  @Get('events')
  @ApiExcludeEndpoint()
  async getRecentEvents() {
    const events = this.webhooksService.getProcessedEvents();
    const failed = this.webhooksService.getFailedEvents();

    return {
      total: events.length,
      processed: events.filter(e => e.status === 'processed').length,
      failed: failed.length,
      pending: events.filter(e => e.status === 'pending').length,
      recentEvents: events.slice(-20).reverse(),
      failedEvents: failed,
    };
  }

  /**
   * Determine if error should trigger webhook retry
   */
  private isRetryableError(error: any): boolean {
    // Network errors, rate limits, and temporary failures are retryable
    const retryableCodes = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'RATE_LIMITED',
      'SERVICE_UNAVAILABLE',
    ];

    if (error?.code && retryableCodes.includes(error.code)) {
      return true;
    }

    // Database connection errors are retryable
    if (error?.message?.includes('database') || error?.message?.includes('connection')) {
      return true;
    }

    return false;
  }
}
