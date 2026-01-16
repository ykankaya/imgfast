import type { RequestContext, RateLimitResult, Env } from '../types';

/**
 * Sliding window rate limiter using KV storage.
 * Implements a token bucket algorithm with per-second limits.
 */
export async function rateLimiter(context: RequestContext): Promise<RateLimitResult> {
  const { publicKey, env, customer, ctx } = context;

  if (!customer) {
    return { allowed: false, limit: 0, remaining: 0, retryAfter: 60 };
  }

  const limit = customer.limits.rateLimit;
  const windowSize = 1; // 1 second window
  const now = Math.floor(Date.now() / 1000);
  const key = `ratelimit:${publicKey}:${now}`;

  try {
    // Get current count for this window
    const currentCountStr = await env.CACHE_KV.get(key);
    const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;

    if (currentCount >= limit) {
      // Check if we should add to retry-after based on next window
      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfter: 1,
      };
    }

    // Increment counter asynchronously (don't block response)
    // Note: KV requires minimum 60 second TTL
    ctx.waitUntil(
      env.CACHE_KV.put(key, String(currentCount + 1), {
        expirationTtl: 60,
      }).catch(err => console.error('Rate limit update failed:', err))
    );

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - currentCount - 1),
    };
  } catch (error) {
    // On error, allow request but log
    console.error('Rate limit check failed:', error);
    return { allowed: true, limit, remaining: limit };
  }
}

/**
 * Burst rate limiter for handling traffic spikes.
 * Uses a larger window (10 seconds) with higher limits.
 */
export async function burstRateLimiter(context: RequestContext): Promise<RateLimitResult> {
  const { publicKey, env, customer, ctx } = context;

  if (!customer) {
    return { allowed: false, limit: 0, remaining: 0, retryAfter: 60 };
  }

  // Burst limit is 10x the per-second rate over 10 seconds
  const burstLimit = customer.limits.rateLimit * 10;
  const windowSize = 10;
  const windowStart = Math.floor(Date.now() / 1000 / windowSize) * windowSize;
  const key = `burst:${publicKey}:${windowStart}`;

  try {
    const currentCountStr = await env.CACHE_KV.get(key);
    const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;

    if (currentCount >= burstLimit) {
      const windowEnd = windowStart + windowSize;
      const now = Math.floor(Date.now() / 1000);
      const retryAfter = Math.max(1, windowEnd - now);

      return {
        allowed: false,
        limit: burstLimit,
        remaining: 0,
        retryAfter,
      };
    }

    ctx.waitUntil(
      env.CACHE_KV.put(key, String(currentCount + 1), {
        expirationTtl: 60,
      }).catch(err => console.error('Burst rate limit update failed:', err))
    );

    return {
      allowed: true,
      limit: burstLimit,
      remaining: Math.max(0, burstLimit - currentCount - 1),
    };
  } catch (error) {
    console.error('Burst rate limit check failed:', error);
    return { allowed: true, limit: burstLimit, remaining: burstLimit };
  }
}

/**
 * Monthly quota checker - called less frequently.
 * Actual enforcement happens in backend, this is a soft check.
 */
export async function checkMonthlyQuota(context: RequestContext): Promise<{
  allowed: boolean;
  requestsUsed: number;
  bandwidthUsed: number;
  warningLevel: 'none' | 'approaching' | 'exceeded';
}> {
  const { publicKey, env, customer } = context;

  if (!customer) {
    return {
      allowed: false,
      requestsUsed: 0,
      bandwidthUsed: 0,
      warningLevel: 'exceeded',
    };
  }

  const monthKey = getMonthKey();
  const quotaKey = `quota:${publicKey}:${monthKey}`;

  try {
    const usage = await env.CACHE_KV.get<{
      requests: number;
      bandwidth: number;
    }>(quotaKey, 'json');

    if (!usage) {
      return {
        allowed: true,
        requestsUsed: 0,
        bandwidthUsed: 0,
        warningLevel: 'none',
      };
    }

    const requestsPercent = (usage.requests / customer.limits.maxRequestsPerMonth) * 100;
    const bandwidthPercent = (usage.bandwidth / customer.limits.maxBandwidthPerMonth) * 100;

    // Determine warning level
    let warningLevel: 'none' | 'approaching' | 'exceeded' = 'none';
    if (requestsPercent >= 100 || bandwidthPercent >= 100) {
      warningLevel = 'exceeded';
    } else if (requestsPercent >= 80 || bandwidthPercent >= 80) {
      warningLevel = 'approaching';
    }

    // Allow with 10% grace period
    const graceFactor = 1.1;
    const hardRequestLimit = customer.limits.maxRequestsPerMonth * graceFactor;
    const hardBandwidthLimit = customer.limits.maxBandwidthPerMonth * graceFactor;

    const allowed = usage.requests <= hardRequestLimit && usage.bandwidth <= hardBandwidthLimit;

    return {
      allowed,
      requestsUsed: usage.requests,
      bandwidthUsed: usage.bandwidth,
      warningLevel,
    };
  } catch (error) {
    console.error('Quota check failed:', error);
    return {
      allowed: true, // Allow on error, backend will enforce
      requestsUsed: 0,
      bandwidthUsed: 0,
      warningLevel: 'none',
    };
  }
}

/**
 * Update monthly usage counters
 */
export async function updateMonthlyUsage(
  context: RequestContext,
  outputBytes: number
): Promise<void> {
  const { publicKey, env, ctx } = context;

  const monthKey = getMonthKey();
  const quotaKey = `quota:${publicKey}:${monthKey}`;

  ctx.waitUntil(
    (async () => {
      try {
        const current = await env.CACHE_KV.get<{
          requests: number;
          bandwidth: number;
        }>(quotaKey, 'json');

        const updated = {
          requests: (current?.requests || 0) + 1,
          bandwidth: (current?.bandwidth || 0) + outputBytes,
        };

        // Store with expiration at end of next month (safety margin)
        await env.CACHE_KV.put(quotaKey, JSON.stringify(updated), {
          expirationTtl: 60 * 60 * 24 * 62, // ~2 months
        });
      } catch (error) {
        console.error('Monthly usage update failed:', error);
      }
    })()
  );
}

/**
 * IP-based rate limiting for unauthenticated requests
 * Used for health checks and error pages
 */
export async function ipRateLimiter(
  ip: string,
  env: Env,
  ctx: ExecutionContext,
  limit: number = 100
): Promise<RateLimitResult> {
  const windowSize = 60; // 1 minute window
  const windowStart = Math.floor(Date.now() / 1000 / windowSize) * windowSize;
  const key = `ip:${ip}:${windowStart}`;

  try {
    const currentCountStr = await env.CACHE_KV.get(key);
    const currentCount = currentCountStr ? parseInt(currentCountStr, 10) : 0;

    if (currentCount >= limit) {
      const windowEnd = windowStart + windowSize;
      const now = Math.floor(Date.now() / 1000);

      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfter: Math.max(1, windowEnd - now),
      };
    }

    ctx.waitUntil(
      env.CACHE_KV.put(key, String(currentCount + 1), {
        expirationTtl: 120,
      }).catch(err => console.error('IP rate limit update failed:', err))
    );

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - currentCount - 1),
    };
  } catch (error) {
    console.error('IP rate limit check failed:', error);
    return { allowed: true, limit, remaining: limit };
  }
}

/**
 * Get current month key in YYYY-MM format
 */
function getMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
