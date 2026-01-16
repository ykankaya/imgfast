import { handleImageRequest } from './handlers/image';
import { handleHealthCheck } from './handlers/health';
import { validateApiKey } from './middleware/auth';
import { rateLimiter, checkMonthlyQuota, ipRateLimiter } from './middleware/rate-limit';
import { createErrorResponse, createJsonResponse } from './utils/response';
import type { Env, RequestContext } from './types';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Get client IP for logging and IP-based rate limiting
    const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';

    // Health check endpoint (no auth required)
    if (path === '/health' || path === '/_health') {
      // Apply IP-based rate limiting for health checks
      const ipLimit = await ipRateLimiter(clientIp, env, ctx, 60);
      if (!ipLimit.allowed) {
        return createErrorResponse(429, 'Too many requests', {
          'Retry-After': String(ipLimit.retryAfter),
        });
      }
      return handleHealthCheck(env);
    }

    // Favicon - return 204 No Content
    if (path === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    // Robots.txt
    if (path === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /', {
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow GET and HEAD for image requests
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return createErrorResponse(405, 'Method not allowed');
    }

    try {
      // Parse URL: /{public_key}/{image_path}
      const pathParts = path.split('/').filter(Boolean);

      if (pathParts.length < 2) {
        return createErrorResponse(
          400,
          'Invalid URL format. Expected: /{public_key}/{image_path}',
          {},
          {
            documentation: 'https://docs.imagecdn.io/url-format',
            example: '/imgfast_pk_xxxx/images/photo.jpg?w=800&q=80',
          }
        );
      }

      const [publicKey, ...imageParts] = pathParts;
      const imagePath = imageParts.join('/');

      // Build request context
      const context: RequestContext = {
        publicKey,
        imagePath,
        params: Object.fromEntries(url.searchParams),
        request,
        env,
        ctx,
      };

      // === Authentication ===
      const authResult = await validateApiKey(context);
      if (!authResult.valid) {
        return createErrorResponse(authResult.status, authResult.message);
      }
      context.customer = authResult.customer;

      // === Rate Limiting ===
      const rateLimitResult = await rateLimiter(context);
      if (!rateLimitResult.allowed) {
        return createErrorResponse(429, 'Rate limit exceeded', {
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Limit': String(rateLimitResult.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(
            Math.floor(Date.now() / 1000) + (rateLimitResult.retryAfter || 1)
          ),
        });
      }

      // === Monthly Quota Check (soft limit) ===
      const quotaResult = await checkMonthlyQuota(context);
      if (!quotaResult.allowed) {
        return createErrorResponse(
          402,
          'Monthly quota exceeded. Please upgrade your plan.',
          {
            'X-Quota-Requests-Used': String(quotaResult.requestsUsed),
            'X-Quota-Bandwidth-Used': String(quotaResult.bandwidthUsed),
          },
          {
            upgrade_url: 'https://dashboard.imagecdn.io/billing/upgrade',
            current_usage: {
              requests: quotaResult.requestsUsed,
              bandwidth: quotaResult.bandwidthUsed,
            },
          }
        );
      }

      // Add warning headers if approaching quota
      const warningHeaders: Record<string, string> = {};
      if (quotaResult.warningLevel === 'approaching') {
        warningHeaders['X-Quota-Warning'] = 'approaching';
        warningHeaders['X-Quota-Requests-Used'] = String(quotaResult.requestsUsed);
        warningHeaders['X-Quota-Bandwidth-Used'] = String(quotaResult.bandwidthUsed);
      }

      // === Handle Image Request ===
      const response = await handleImageRequest(context);

      // Add rate limit and quota headers to successful responses
      const headers = new Headers(response.headers);
      headers.set('X-RateLimit-Limit', String(rateLimitResult.limit));
      headers.set('X-RateLimit-Remaining', String(rateLimitResult.remaining));

      for (const [key, value] of Object.entries(warningHeaders)) {
        headers.set(key, value);
      }

      // Add CORS headers
      headers.set('Access-Control-Allow-Origin', '*');

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (error) {
      console.error('Unexpected error:', error);

      // Don't expose internal errors in production
      const message =
        env.ENVIRONMENT === 'development'
          ? `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`
          : 'Internal server error';

      return createErrorResponse(500, message);
    }
  },
};
