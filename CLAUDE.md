# ImageCDN - Project Context for AI Assistants

## Project Overview

ImageCDN is a subscription-based, global CDN and image optimization SaaS platform similar to Cloudinary, ImageKit, imgix, or Bunny Optimizer.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Request                           │
│                  cdn.imagecdn.io/{pk}/image.jpg?w=800           │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge (300+ POPs)                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Cache Check │──│ Rate Limiter │──│ Transform (if needed)  │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
        ┌───────────────────┐    ┌───────────────────┐
        │   Cloudflare R2   │    │   Backend API     │
        │   (Origin Store)  │    │   (NestJS)        │
        └───────────────────┘    └─────────┬─────────┘
                                           │
                                    ┌──────┴──────┐
                                    ▼             ▼
                             ┌──────────┐  ┌──────────┐
                             │  Stripe  │  │ Database │
                             └──────────┘  └──────────┘
```

## Monorepo Structure

```
imagecdn/
├── apps/
│   ├── edge-worker/     # Cloudflare Worker - Image transformation & CDN
│   ├── api/             # NestJS Backend - Auth, Billing, Dashboard API
│   └── dashboard/       # Next.js Frontend - Customer Dashboard
├── packages/
│   ├── shared-types/    # TypeScript type definitions
│   ├── config/          # Shared configuration constants
│   └── utils/           # Shared utility functions
├── plugins/             # Platform integrations (WordPress, Shopify, etc.)
└── docs/                # Architecture and API documentation
```

## Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Edge CDN | Cloudflare Workers | Image delivery & transformation |
| Storage | Cloudflare R2 | Original image storage (S3-compatible) |
| Edge Cache | Cloudflare Cache API | Transformed image caching |
| Metadata | Cloudflare KV | Customer config, rate limiting |
| Usage DB | Cloudflare D1 | Usage tracking (SQLite at edge) |
| Backend | NestJS + Fastify | Dashboard API, webhooks |
| Frontend | Next.js 14 | Customer dashboard |
| Billing | Stripe | Subscriptions, invoices |
| Auth | JWT + API Keys | Dashboard + CDN authentication |

## Key Design Decisions

### 1. Edge-First Architecture
- All image requests handled at Cloudflare edge
- Customer config cached in KV for fast lookups
- Backend API only for dashboard operations

### 2. API Key Design
- **Public Key** (`imgcdn_pk_xxx`): Used in CDN URLs, safe to expose
- **Secret Key** (`imgcdn_sk_xxx`): Used for API auth, never expose

### 3. URL Structure
```
https://cdn.imagecdn.io/{public_key}/{image_path}?w=800&q=80&f=webp
```

### 4. Caching Strategy
- Transformed images are immutable (1 year TTL)
- Cache key includes all transform parameters
- Customer config cached for 5 minutes in KV

### 5. Usage Tracking
- Async, batched - never blocks image delivery
- Stored in D1 for edge-native analytics
- Aggregated in KV for fast quota checks

## Code Conventions

### TypeScript
- Strict mode enabled
- Use type imports: `import type { X } from './types'`
- Prefer interfaces for public APIs, types for internal

### Naming
- Files: kebab-case (`rate-limit.ts`)
- Classes: PascalCase (`CustomerService`)
- Functions: camelCase (`getCustomerByKey`)
- Constants: UPPER_SNAKE_CASE (`MAX_IMAGE_WIDTH`)

### Error Handling
- Use custom error classes with codes
- Never expose internal errors to users
- Log errors with context for debugging

### Testing
- Unit tests for utilities and services
- Integration tests for API endpoints
- Use Vitest for all packages

## Common Tasks

### Add a new transformation parameter
1. Add to `TransformParams` in `packages/shared-types`
2. Parse in `apps/edge-worker/src/utils/params.ts`
3. Apply in `apps/edge-worker/src/services/transform.ts`
4. Document in API docs

### Add a new API endpoint
1. Create controller in `apps/api/src/modules/`
2. Add to module imports
3. Add Swagger decorators
4. Write integration tests

### Update pricing plans
1. Modify `PLAN_LIMITS` and `PLAN_FEATURES` in `packages/config`
2. Update Stripe products/prices
3. Update dashboard UI

## Environment Variables

### Edge Worker (wrangler.toml secrets)
- `API_SECRET_KEY` - Internal API authentication
- `BACKEND_API_URL` - Backend API base URL

### Backend API (.env)
- `JWT_SECRET` - JWT signing key
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Webhook verification
- `R2_*` - R2 storage credentials

### Dashboard (.env.local)
- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_CDN_URL` - CDN base URL

## Security Considerations

1. **Rate Limiting**: Per-customer limits enforced at edge
2. **Domain Restrictions**: Optional allowlist per customer
3. **Signed URLs**: HMAC-signed URLs for premium plans
4. **File Size Limits**: Enforced per plan tier
5. **No Image Processing in Plugins**: Plugins only rewrite URLs

## Performance Goals

- **p50 Latency**: < 50ms (cache hit)
- **p99 Latency**: < 200ms (transform)
- **Cache Hit Rate**: > 90%
- **Availability**: 99.9%

## Future Roadmap

1. [ ] AVIF support for all plans
2. [ ] Smart cropping (face detection)
3. [ ] Video optimization
4. [ ] Custom domains with SSL
5. [ ] GraphQL API
