# ImageCDN Architecture Overview

## System Architecture

ImageCDN is designed as an edge-first image optimization platform with the following key components:

### 1. Edge Layer (Cloudflare Workers)

The edge layer handles all image requests with minimal latency:

```
Request Flow:
┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────┐
│ Browser │───▶│ Edge Worker │───▶│ Cache Check │───▶│ Response │
└─────────┘    └─────────────┘    └──────┬──────┘    └──────────┘
                                         │
                                    Cache Miss
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │  R2 Fetch   │
                                  └──────┬──────┘
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │  Transform  │
                                  └──────┬──────┘
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │ Cache Store │
                                  └─────────────┘
```

**Responsibilities:**
- URL parsing and parameter validation
- API key verification (via KV cache)
- Rate limiting (sliding window in KV)
- Image fetching from R2
- Image transformation (via Cloudflare Image Resizing)
- Response caching (Cache API)
- Usage tracking (async to D1)

### 2. Storage Layer (Cloudflare R2)

Original images are stored in R2 with the following structure:

```
imagecdn-images/
├── {public_key}/
│   ├── images/
│   │   ├── hero.jpg
│   │   └── products/
│   │       └── item-001.png
│   └── assets/
│       └── logo.svg
```

**Features:**
- S3-compatible API
- Zero egress fees
- Multi-region replication
- Presigned URL uploads

### 3. Backend API (NestJS)

The backend API handles all non-edge operations:

```
┌─────────────────────────────────────────────────────────────┐
│                      Backend API                             │
├─────────────────────────────────────────────────────────────┤
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐ │
│  │   Auth    │  │ Customers │  │  Billing  │  │  Images  │ │
│  │  Module   │  │  Module   │  │  Module   │  │  Module  │ │
│  └───────────┘  └───────────┘  └───────────┘  └──────────┘ │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │   Usage   │  │ Webhooks  │  │ Internal  │               │
│  │  Module   │  │  Module   │  │  Module   │               │
│  └───────────┘  └───────────┘  └───────────┘               │
└─────────────────────────────────────────────────────────────┘
```

**Modules:**
- **Auth**: JWT tokens, API key generation
- **Customers**: Profile, settings, domain restrictions
- **Billing**: Stripe integration, plans, invoices
- **Images**: Upload URLs, listing, deletion
- **Usage**: Analytics, quota checking
- **Webhooks**: Stripe event handling
- **Internal**: Edge worker communication

### 4. Dashboard (Next.js)

Customer-facing dashboard with:

- **Overview**: Usage stats, quick start
- **Images**: Browse, upload, manage
- **Usage**: Detailed analytics, quota status
- **API Keys**: Generate, rotate, manage
- **Billing**: Plans, invoices, portal
- **Settings**: Domains, defaults, security

## Data Flow

### Image Request Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant E as Edge Worker
    participant K as KV Store
    participant C as Cache API
    participant R as R2 Storage
    participant D as D1 Database

    B->>E: GET /pk_xxx/image.jpg?w=800
    E->>K: Get customer config
    K-->>E: Customer data (cached)
    E->>K: Check rate limit
    K-->>E: Allowed
    E->>C: Check cache
    alt Cache Hit
        C-->>E: Cached image
        E-->>B: 200 OK (X-Cache: HIT)
    else Cache Miss
        E->>R: Fetch original
        R-->>E: Original image
        E->>E: Transform image
        E->>C: Store in cache
        E-->>B: 200 OK (X-Cache: MISS)
    end
    E--)D: Track usage (async)
```

### Billing Flow

```mermaid
sequenceDiagram
    participant U as User
    participant D as Dashboard
    participant A as API
    participant S as Stripe

    U->>D: Click "Upgrade to Pro"
    D->>A: POST /billing/checkout
    A->>S: Create checkout session
    S-->>A: Session URL
    A-->>D: Redirect URL
    D->>S: Redirect to checkout
    U->>S: Complete payment
    S->>A: Webhook: checkout.session.completed
    A->>A: Update customer plan
    A-->>S: 200 OK
```

## Caching Strategy

### Edge Cache (Cache API)

- **Scope**: Per-POP (not global)
- **Key**: `imagecdn:{pk}:{path}:{params_hash}`
- **TTL**: 1 year (immutable assets)
- **Purge**: Via API or dashboard

### Customer Config Cache (KV)

- **Key**: `customer:{public_key}`
- **TTL**: 5 minutes
- **Refresh**: On config change via webhook

### Rate Limit Cache (KV)

- **Key**: `ratelimit:{pk}:{second}`
- **TTL**: 2 seconds
- **Strategy**: Sliding window counter

## Security Model

### Authentication

| Context | Method | Token Type |
|---------|--------|------------|
| Dashboard | JWT | Bearer token |
| API | API Key | X-API-Key header |
| CDN | Public Key | URL path |
| Internal | Secret | Bearer token |

### Authorization

```
Customer Plan → Features + Limits
                    │
                    ├── AVIF Support
                    ├── Signed URLs
                    ├── Custom Domains
                    ├── Max Dimensions
                    ├── Rate Limits
                    └── Bandwidth Quota
```

### Domain Restrictions

Optional per-customer domain allowlist:
- Checked via `Origin` and `Referer` headers
- Supports wildcards (`*.example.com`)
- Bypass for server-to-server requests

## Scalability

### Horizontal Scaling

- **Edge Workers**: Auto-scaled by Cloudflare
- **Backend API**: Stateless, can run multiple instances
- **Database**: Migrate to managed PostgreSQL for scale

### Performance Optimization

1. **Cache Everything**: Immutable transformed images
2. **Async Processing**: Usage tracking never blocks
3. **Edge Config**: Customer data at edge via KV
4. **Batch Operations**: Bulk usage writes to D1

## Monitoring & Observability

### Metrics

- Request count by status code
- Cache hit/miss ratio
- Transform latency percentiles
- Bandwidth usage by customer
- Error rates by type

### Alerting

- Cache hit rate < 80%
- Error rate > 1%
- Latency p99 > 500ms
- Quota exceeded events

## Disaster Recovery

### Data Durability

- R2: Multi-region replication
- D1: Automatic backups
- KV: Edge-replicated

### Failover

- Edge: Automatic via Cloudflare anycast
- API: Health checks + load balancer
- Stripe: Webhook retry with idempotency
