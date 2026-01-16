import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  UnauthorizedException,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { CustomersService } from '../customers/customers.service';
import { UsageService } from '../usage/usage.service';

/**
 * Usage record from edge worker
 */
interface UsageRecord {
  customerId: string;
  publicKey: string;
  timestamp: number;
  requestType: 'transform' | 'cache_hit' | 'origin';
  inputBytes: number;
  outputBytes: number;
  transformParams: string;
  statusCode: number;
  responseTime: number;
  cacheStatus: 'HIT' | 'MISS' | 'BYPASS';
  edgeLocation: string;
}

/**
 * Internal API endpoints for edge worker communication.
 * Protected by internal API key - not exposed to public.
 *
 * These endpoints are called by Cloudflare Workers to:
 * 1. Validate API keys and fetch customer config
 * 2. Retrieve secret keys for signature verification
 * 3. Report usage data
 * 4. Invalidate cache entries
 */
@ApiTags('Internal')
@Controller('internal')
export class InternalController {
  constructor(
    private readonly configService: ConfigService,
    private readonly customersService: CustomersService,
    private readonly usageService: UsageService
  ) {}

  /**
   * Validate internal API request.
   * Uses constant-time comparison to prevent timing attacks.
   */
  private validateInternalRequest(authHeader: string | undefined): void {
    const apiSecret = this.configService.get<string>('API_SECRET_KEY');
    if (!apiSecret) {
      throw new UnauthorizedException('Internal API not configured');
    }

    const expectedAuth = `Bearer ${apiSecret}`;

    if (!authHeader || !this.secureCompare(authHeader, expectedAuth)) {
      throw new UnauthorizedException('Invalid internal API key');
    }
  }

  /**
   * Constant-time string comparison
   */
  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  /**
   * Get customer by public key (for edge worker auth)
   * Used during API key validation
   */
  @Get('customers/by-key/:publicKey')
  @ApiExcludeEndpoint()
  async getCustomerByPublicKey(
    @Param('publicKey') publicKey: string,
    @Headers('authorization') authHeader: string
  ) {
    this.validateInternalRequest(authHeader);

    const customer = await this.customersService.findByPublicKey(publicKey);

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Return customer config for edge worker
    return {
      customer: {
        id: customer.id,
        publicKey: customer.publicKey,
        plan: customer.plan,
        status: customer.status,
        allowedDomains: customer.allowedDomains || [],
        allowedReferrers: customer.allowedReferrers || [],
        features: this.getFeaturesByPlan(customer.plan.tier),
        limits: this.getLimitsByPlan(customer.plan.tier),
      },
    };
  }

  /**
   * Get customer secret key (for signed URL verification)
   * Only returns the secret key hash - worker uses it for HMAC verification
   */
  @Get('customers/:customerId/secret')
  @ApiExcludeEndpoint()
  async getCustomerSecret(
    @Param('customerId') customerId: string,
    @Headers('authorization') authHeader: string
  ) {
    this.validateInternalRequest(authHeader);

    const customer = await this.customersService.findById(customerId);

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Return the secret key for signature verification
    // In production, this would be stored encrypted and decrypted here
    return {
      secretKey: customer.secretKeyHash,
    };
  }

  /**
   * Verify an API key and return customer ID
   * Quick endpoint for just checking if key is valid
   */
  @Get('verify/:publicKey')
  @ApiExcludeEndpoint()
  async verifyApiKey(
    @Param('publicKey') publicKey: string,
    @Headers('authorization') authHeader: string
  ) {
    this.validateInternalRequest(authHeader);

    const customer = await this.customersService.findByPublicKey(publicKey);

    return {
      valid: !!customer && customer.status === 'active',
      customerId: customer?.id,
      status: customer?.status,
      tier: customer?.plan.tier,
    };
  }

  /**
   * Report usage from edge worker
   * Accepts batched usage records for efficiency
   */
  @Post('usage')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiExcludeEndpoint()
  async reportUsage(
    @Body() body: { records: UsageRecord[] },
    @Headers('authorization') authHeader: string
  ) {
    this.validateInternalRequest(authHeader);

    const { records } = body;

    if (!Array.isArray(records) || records.length === 0) {
      return { accepted: 0 };
    }

    // Process usage records asynchronously
    // In production, this would write to a queue or time-series DB
    await this.usageService.recordBatch(records);

    return {
      accepted: records.length,
      timestamp: Date.now(),
    };
  }

  /**
   * Invalidate cache for a specific customer/path
   * Called when customer uploads new version or deletes image
   */
  @Post('cache/invalidate')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async invalidateCache(
    @Body() body: { publicKey: string; paths?: string[] },
    @Headers('authorization') authHeader: string
  ) {
    this.validateInternalRequest(authHeader);

    const { publicKey, paths } = body;

    // In production, this would:
    // 1. Use Cloudflare API to purge cache tags
    // 2. Update KV to mark paths as invalidated
    // 3. Notify edge workers via Durable Objects or Queue

    return {
      success: true,
      publicKey,
      pathsInvalidated: paths?.length || 0,
      message: 'Cache invalidation queued',
    };
  }

  /**
   * Get current quota status for a customer
   * Used for soft quota enforcement at edge
   */
  @Get('quota/:publicKey')
  @ApiExcludeEndpoint()
  async getQuotaStatus(
    @Param('publicKey') publicKey: string,
    @Headers('authorization') authHeader: string
  ) {
    this.validateInternalRequest(authHeader);

    const customer = await this.customersService.findByPublicKey(publicKey);

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const limits = this.getLimitsByPlan(customer.plan.tier);
    const usage = await this.usageService.getCurrentMonthUsage(customer.id);

    return {
      customerId: customer.id,
      period: this.getCurrentMonthPeriod(),
      limits: {
        requests: limits.maxRequestsPerMonth,
        bandwidth: limits.maxBandwidthPerMonth,
      },
      usage: {
        requests: usage.requests,
        bandwidth: usage.bandwidth,
      },
      percentUsed: {
        requests: Math.round((usage.requests / limits.maxRequestsPerMonth) * 100),
        bandwidth: Math.round((usage.bandwidth / limits.maxBandwidthPerMonth) * 100),
      },
      overLimit:
        usage.requests > limits.maxRequestsPerMonth ||
        usage.bandwidth > limits.maxBandwidthPerMonth,
    };
  }

  /**
   * Health check for internal API
   */
  @Get('health')
  @ApiExcludeEndpoint()
  async health(@Headers('authorization') authHeader: string) {
    this.validateInternalRequest(authHeader);

    return {
      status: 'healthy',
      timestamp: Date.now(),
      version: '1.0.0',
    };
  }

  /**
   * Get features by plan tier
   */
  private getFeaturesByPlan(tier: string) {
    const features: Record<string, any> = {
      free: {
        signedUrls: false,
        customDomains: false,
        avifSupport: false,
        removeWatermark: false,
        priorityProcessing: false,
      },
      starter: {
        signedUrls: false,
        customDomains: true,
        avifSupport: true,
        removeWatermark: true,
        priorityProcessing: false,
      },
      pro: {
        signedUrls: true,
        customDomains: true,
        avifSupport: true,
        removeWatermark: true,
        priorityProcessing: true,
      },
      enterprise: {
        signedUrls: true,
        customDomains: true,
        avifSupport: true,
        removeWatermark: true,
        priorityProcessing: true,
      },
    };

    return features[tier] || features.free;
  }

  /**
   * Get limits by plan tier
   */
  private getLimitsByPlan(tier: string) {
    const limits: Record<string, any> = {
      free: {
        maxRequestsPerMonth: 10000,
        maxBandwidthPerMonth: 1 * 1024 * 1024 * 1024, // 1GB
        maxImageWidth: 2048,
        maxImageHeight: 2048,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        rateLimit: 10, // per second
      },
      starter: {
        maxRequestsPerMonth: 100000,
        maxBandwidthPerMonth: 10 * 1024 * 1024 * 1024, // 10GB
        maxImageWidth: 4096,
        maxImageHeight: 4096,
        maxFileSize: 25 * 1024 * 1024, // 25MB
        rateLimit: 50,
      },
      pro: {
        maxRequestsPerMonth: 500000,
        maxBandwidthPerMonth: 50 * 1024 * 1024 * 1024, // 50GB
        maxImageWidth: 8192,
        maxImageHeight: 8192,
        maxFileSize: 50 * 1024 * 1024, // 50MB
        rateLimit: 100,
      },
      enterprise: {
        maxRequestsPerMonth: 5000000,
        maxBandwidthPerMonth: 500 * 1024 * 1024 * 1024, // 500GB
        maxImageWidth: 16384,
        maxImageHeight: 16384,
        maxFileSize: 100 * 1024 * 1024, // 100MB
        rateLimit: 500,
      },
    };

    return limits[tier] || limits.free;
  }

  /**
   * Get current month period string
   */
  private getCurrentMonthPeriod(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }
}
