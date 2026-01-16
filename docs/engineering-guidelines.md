# Engineering Guidelines

> **You are not prototyping. You are building infrastructure.**

This document defines the engineering principles, expectations, and standards for all contributors to the ImageCDN platform.

---

## Your Responsibility

As an engineer on this team, you are expected to:

| Responsibility | Description |
|----------------|-------------|
| **Write scalable code** | Production-quality, not MVP-quality |
| **Think multi-tenant** | Every decision affects all customers |
| **Prioritize performance** | Milliseconds matter at scale |
| **Prioritize security** | Every endpoint is an attack surface |
| **Optimize costs** | Infrastructure costs directly impact margins |
| **Avoid single-customer assumptions** | Design for the 99th percentile |
| **Design for scale** | Millions of daily requests, not thousands |

---

## Tech Stack

### Edge Layer (Cloudflare)

| Component | Purpose |
|-----------|---------|
| **Workers** | Edge routing, authentication, cache logic, lightweight transforms |
| **KV** | Customer config cache, rate limiting counters |
| **R2** | Origin image storage (zero egress fees) |
| **D1** | Edge-local usage tracking (SQLite) |
| **Cache API** | Transformed image caching |

### Origin Layer (Node.js)

| Component | Purpose |
|-----------|---------|
| **Fastify** | High-performance HTTP server |
| **Sharp (libvips)** | Heavy image transformations |
| **Prisma** | Database ORM |
| **PostgreSQL** | Primary data store |

### Infrastructure

| Component | Purpose |
|-----------|---------|
| **Stripe** | Billing, subscriptions, metered usage |
| **Redis** | Session cache, job queues (optional) |
| **Turborepo** | Monorepo build orchestration |

---

## Engineering Principles

### 1. Edge-First, Not Origin-First

```
❌ Wrong: Request → Origin → Process → Cache → Respond
✅ Right: Request → Edge Cache → (miss) → Edge Process → Cache → Respond
```

- Transform at the edge whenever possible
- Origin is the last resort, not the first stop
- Every origin request costs money and latency

### 2. Cache Before Compute

```typescript
// ❌ Wrong: Always transform
const image = await transformImage(original, params);
return image;

// ✅ Right: Check cache first
const cached = await cache.get(cacheKey);
if (cached) return cached;

const image = await transformImage(original, params);
await cache.put(cacheKey, image);
return image;
```

- Cache hit = ~5ms, Cache miss = ~200ms
- Design cache keys for maximum reuse
- Immutable assets get immutable cache headers

### 3. Stateless by Default

```typescript
// ❌ Wrong: Store state in memory
class ImageProcessor {
  private processingQueue: Map<string, Promise<Buffer>> = new Map();
}

// ✅ Right: Stateless processing
async function processImage(request: Request): Promise<Response> {
  // All state comes from request or external stores
  const params = parseParams(request.url);
  const customer = await fetchCustomer(params.publicKey);
  return await transform(params, customer);
}
```

- Workers can be terminated at any time
- No in-memory state that can't be lost
- Use KV/D1/R2 for persistence

### 4. Deterministic Outputs

```typescript
// ❌ Wrong: Non-deterministic cache key
const cacheKey = `${imagePath}-${Date.now()}`;

// ✅ Right: Deterministic cache key
const cacheKey = `${publicKey}:${imagePath}:${hashParams(params)}`;
```

- Same input = Same output, always
- Cache keys must be reproducible
- No randomness in transformation logic

### 5. Fail Fast, Never Fail Silently

```typescript
// ❌ Wrong: Silent failure
try {
  await processImage(request);
} catch (e) {
  return new Response('', { status: 200 }); // Silent failure
}

// ✅ Right: Explicit failure
try {
  await processImage(request);
} catch (e) {
  console.error('Image processing failed:', e);
  return new Response(
    JSON.stringify({ error: true, message: e.message }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}
```

- Errors must be visible
- Log everything that fails
- Return appropriate error codes

---

## What NOT To Do

### ❌ No Image Processing in Plugins

```php
// ❌ NEVER do this in WordPress plugin
function imagecdn_process_image($image) {
    $resized = imagescale($image, 800, 600); // NO!
    return $resized;
}

// ✅ Plugin only rewrites URLs
function imagecdn_rewrite_url($url) {
    return "https://cdn.imagecdn.io/{$key}/{$path}?w=800&h=600";
}
```

- Plugins are thin URL rewriters
- All processing happens at the edge
- Plugin = Zero compute

### ❌ No Blocking Analytics

```typescript
// ❌ Wrong: Blocking analytics
await trackUsage(customerId, bytes);
return response;

// ✅ Right: Non-blocking analytics
ctx.waitUntil(trackUsage(customerId, bytes));
return response;
```

- Analytics must never block responses
- Use `waitUntil()` for async operations
- Eventual consistency is acceptable

### ❌ No Unbounded Memory or CPU

```typescript
// ❌ Wrong: Unbounded processing
async function transform(params: TransformParams) {
  return sharp(buffer)
    .resize(params.width, params.height) // Could be 100000x100000!
    .toBuffer();
}

// ✅ Right: Bounded processing
const MAX_DIMENSION = 8192;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

async function transform(params: TransformParams, limits: CustomerLimits) {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error('File too large');
  }
  
  const width = Math.min(params.width || 0, limits.maxImageWidth, MAX_DIMENSION);
  const height = Math.min(params.height || 0, limits.maxImageHeight, MAX_DIMENSION);
  
  return sharp(buffer)
    .resize(width || null, height || null)
    .toBuffer();
}
```

- Always enforce limits
- Limits come from customer plan
- Hard limits exist above plan limits

### ❌ No Dynamic Parameters Without Strict Limits

```typescript
// ❌ Wrong: Accept any parameter value
const quality = parseInt(params.q); // Could be -1 or 999999

// ✅ Right: Strict validation
const quality = Math.max(1, Math.min(100, parseInt(params.q) || 80));
```

- Validate every input
- Default to safe values
- Clamp to valid ranges

---

## Development Expectations

### Every Image Transformation Must Be Cacheable

```typescript
// Cache key components (all must be deterministic)
const cacheKey = [
  publicKey,           // Customer identifier
  imagePath,           // Source image
  width,               // Transform params
  height,
  quality,
  format,
  fit,
].join(':');

// Cache headers for transformed images
headers.set('Cache-Control', 'public, max-age=31536000, immutable');
headers.set('CDN-Cache-Control', 'max-age=31536000');
```

### Every Request Must Be Authenticated or Rate-Limited

```typescript
// Public endpoints: Rate limit by IP
if (isPublicEndpoint(path)) {
  const ipLimit = await ipRateLimiter(clientIp, env, ctx);
  if (!ipLimit.allowed) {
    return createErrorResponse(429, 'Too many requests');
  }
}

// Protected endpoints: Authenticate + Rate limit by key
const authResult = await validateApiKey(context);
if (!authResult.valid) {
  return createErrorResponse(authResult.status, authResult.message);
}

const rateLimit = await rateLimiter(context);
if (!rateLimit.allowed) {
  return createErrorResponse(429, 'Rate limit exceeded');
}
```

### Abuse Prevention Is Part of Feature Work

When building any feature, ask:

1. **Can this be abused?** - Assume it will be
2. **What are the limits?** - Define them explicitly
3. **How do we detect abuse?** - Add monitoring
4. **How do we respond?** - Rate limit, block, alert

```typescript
// Feature: Image transformation
// Abuse vector: Massive images to exhaust CPU
// Mitigation: Dimension limits per plan
// Detection: Track processing time per customer
// Response: Suspend customers exceeding limits
```

### Billing and Usage Safety Override Feature Velocity

```typescript
// ❌ Wrong: Ship feature, add billing later
async function newFeature(request: Request) {
  return await expensiveOperation(request);
}

// ✅ Right: Billing check is part of the feature
async function newFeature(request: Request, customer: Customer) {
  // Check if feature is available on plan
  if (!customer.features.newFeature) {
    return createErrorResponse(402, 'Upgrade required');
  }
  
  // Check quota before expensive operation
  const quota = await checkQuota(customer.id);
  if (quota.exceeded) {
    return createErrorResponse(402, 'Quota exceeded');
  }
  
  // Track usage
  ctx.waitUntil(trackUsage(customer.id, 'new_feature', 1));
  
  return await expensiveOperation(request);
}
```

---

## Code Quality Standards

### Defensive Coding

```typescript
// Assume inputs are malicious
function parseParams(url: URL): TransformParams {
  const params: TransformParams = {};
  
  // Width: Must be positive integer within limits
  const w = url.searchParams.get('w');
  if (w !== null) {
    const parsed = parseInt(w, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= MAX_WIDTH) {
      params.width = parsed;
    }
  }
  
  // Quality: Must be 1-100
  const q = url.searchParams.get('q');
  if (q !== null) {
    const parsed = parseInt(q, 10);
    if (!isNaN(parsed)) {
      params.quality = Math.max(1, Math.min(100, parsed));
    }
  }
  
  // Format: Must be from allowed list
  const f = url.searchParams.get('f');
  if (f !== null && ALLOWED_FORMATS.includes(f)) {
    params.format = f as ImageFormat;
  }
  
  return params;
}
```

### Explicit Limits

```typescript
// All limits defined in one place
export const LIMITS = {
  // Hard system limits (cannot be exceeded by any plan)
  MAX_IMAGE_WIDTH: 16384,
  MAX_IMAGE_HEIGHT: 16384,
  MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024, // 100MB
  MAX_QUALITY: 100,
  MIN_QUALITY: 1,
  
  // Rate limits
  MAX_REQUESTS_PER_SECOND: 1000,
  MAX_BURST_REQUESTS: 5000,
  
  // Timeouts
  TRANSFORM_TIMEOUT_MS: 30000,
  ORIGIN_FETCH_TIMEOUT_MS: 10000,
  
  // Cache
  MAX_CACHE_SIZE_BYTES: 50 * 1024 * 1024, // 50MB per image
  CACHE_TTL_SECONDS: 31536000, // 1 year
} as const;
```

### Clear Error Paths

```typescript
// Every error has a clear response
export function createErrorResponse(
  status: number,
  message: string,
  headers?: Record<string, string>,
  details?: Record<string, unknown>
): Response {
  return new Response(
    JSON.stringify({
      error: true,
      status,
      message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Error': 'true',
        ...headers,
      },
    }
  );
}

// Usage
if (!customer) {
  return createErrorResponse(401, 'Invalid API key', {}, {
    documentation: 'https://docs.imagecdn.io/authentication',
  });
}

if (customer.status === 'suspended') {
  return createErrorResponse(402, 'Account suspended', {}, {
    reason: 'payment_failed',
    action: 'https://dashboard.imagecdn.io/billing',
  });
}
```

### Production-Safe Defaults

```typescript
// Default values that are safe in production
const DEFAULT_PARAMS: Required<TransformParams> = {
  width: undefined,      // No resize by default
  height: undefined,
  quality: 80,           // Good balance of size/quality
  format: 'auto',        // Best format for browser
  fit: 'cover',          // Standard fit mode
  gravity: 'center',     // Center crop
  blur: 0,               // No blur
  sharpen: 0,            // No sharpen
};

// Environment defaults
const ENV_DEFAULTS = {
  CACHE_TTL_SECONDS: '31536000',
  MAX_IMAGE_WIDTH: '4096',
  MAX_IMAGE_HEIGHT: '4096',
  DEFAULT_QUALITY: '80',
  RATE_LIMIT_PER_SECOND: '100',
};
```

---

## Code Review Checklist

Before submitting any PR, verify:

### Security
- [ ] All inputs are validated
- [ ] Authentication is required where needed
- [ ] Rate limiting is applied
- [ ] No secrets in code or logs

### Performance
- [ ] Results are cacheable
- [ ] No blocking operations in hot path
- [ ] Resource limits are enforced
- [ ] Timeouts are set

### Reliability
- [ ] Errors are handled explicitly
- [ ] Failures are logged
- [ ] Graceful degradation is implemented
- [ ] No silent failures

### Billing
- [ ] Usage is tracked
- [ ] Quotas are checked
- [ ] Feature flags are respected
- [ ] Plan limits are enforced

### Multi-tenancy
- [ ] Customer isolation is maintained
- [ ] No cross-tenant data leaks
- [ ] Per-customer limits apply
- [ ] Noisy neighbor prevention

---

## Summary

| Principle | Implementation |
|-----------|----------------|
| Edge-first | Process at Workers, not origin |
| Cache before compute | Check cache before any work |
| Stateless | No in-memory state |
| Deterministic | Same input = same output |
| Fail fast | Explicit errors, never silent |
| Bounded | All operations have limits |
| Authenticated | Every request verified |
| Tracked | All usage recorded |
| Safe defaults | Production-ready out of box |

---

*Remember: You are building infrastructure that will serve millions of requests daily. Every line of code matters.*
