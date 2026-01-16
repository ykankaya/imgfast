# Imgfast Infrastructure

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Request                           │
│                  cdn.imgfast.io/{pk}/image.jpg?w=800            │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge (300+ POPs)                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Cache Check │──│ Rate Limiter │──│ Transform (if needed)  │  │
│  │   (KV)      │  │    (KV)      │  │   (Edge Worker)        │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
        ┌───────────────────┐    ┌───────────────────┐
        │   Cloudflare R2   │    │   Railway API     │
        │   (Image Store)   │    │   (NestJS)        │
        │  imgfast-images   │    │                   │
        └───────────────────┘    └─────────┬─────────┘
                                           │
                                    ┌──────┴──────┐
                                    ▼             ▼
                             ┌──────────┐  ┌──────────┐
                             │  Stripe  │  │ Postgres │
                             │ (billing)│  │ (Railway)│
                             └──────────┘  └──────────┘
```

---

## Components

### 1. Dashboard (Cloudflare Pages)

**Purpose**: Customer-facing web application

**Stack**:
- Next.js 14 (App Router)
- Static Export
- Tailwind CSS

**URL**: https://app.imgfast.io

**Features**:
- User authentication
- API key management
- Usage statistics
- Billing management
- Image browser

---

### 2. API (Railway)

**Purpose**: Backend REST API

**Stack**:
- NestJS 10
- Fastify
- Prisma ORM
- PostgreSQL

**URL**: https://api.imgfast.io

**Endpoints**:
```
GET  /api/v1/health          - Health check
POST /api/v1/auth/login      - User login
GET  /api/v1/auth/me         - Current user
POST /api/v1/auth/api-keys   - Generate API key
GET  /api/v1/customers/me    - Customer info
GET  /api/v1/usage/current   - Current usage
GET  /api/v1/billing/plans   - Available plans
POST /api/v1/images/upload   - Get upload URL
```

---

### 3. Edge Worker (Cloudflare Workers)

**Purpose**: Image transformation and delivery at edge

**Stack**:
- Cloudflare Workers
- TypeScript
- Cloudflare Image Resizing

**URL**: https://cdn.imgfast.io

**URL Pattern**:
```
https://cdn.imgfast.io/{public_key}/{image_path}?w=800&h=600&q=80&f=webp
```

**Transform Parameters**:
| Param | Description | Example |
|-------|-------------|---------|
| `w` | Width | `w=800` |
| `h` | Height | `h=600` |
| `q` | Quality (1-100) | `q=80` |
| `f` | Format | `f=webp,avif,auto` |
| `fit` | Fit mode | `fit=cover,contain,fill` |
| `blur` | Blur amount | `blur=10` |

---

## Cloudflare Resources

### R2 Bucket: `imgfast-images`

**Purpose**: Store original uploaded images

**Structure**:
```
imgfast-images/
├── {customer_id}/
│   ├── {image_path}
│   └── ...
```

**Access**: Via Edge Worker with binding `IMAGES_BUCKET`

---

### D1 Database: `imgfast-usage`

**ID**: `eb96a086-b790-4093-988f-1a6fa857dec7`

**Purpose**: Track usage metrics at edge (async)

**Schema**:
```sql
CREATE TABLE usage_logs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  request_type TEXT,
  input_bytes INTEGER,
  output_bytes INTEGER,
  transform_params TEXT,
  status_code INTEGER,
  response_time INTEGER,
  cache_status TEXT,
  edge_location TEXT
);

CREATE INDEX idx_customer_timestamp ON usage_logs(customer_id, timestamp);
```

---

### KV Namespace: `imgfast-cache`

**ID**: `ab29dbb62df849759ba652d4144ba2b6`

**Purpose**: 
- Customer configuration cache
- Rate limiting counters
- Feature flags

**Key Patterns**:
```
customer:{public_key}     → Customer config JSON (5 min TTL)
rate:{public_key}:{hour}  → Request count
quota:{public_key}        → Monthly quota status
```

---

## Data Flow

### Image Request Flow

```
1. Client requests: cdn.imgfast.io/pk_xxx/photos/hero.jpg?w=800

2. Edge Worker receives request
   ├── Parse public_key and image path
   ├── Check KV for customer config (cache)
   │   └── If miss, fetch from API and cache
   ├── Validate customer (active, within quota)
   └── Check rate limits

3. Cache lookup (Cloudflare Cache API)
   ├── Cache key = URL + all transform params
   └── If HIT, return cached response

4. Transform (if cache MISS)
   ├── Fetch original from R2
   ├── Apply transformations (resize, format, quality)
   ├── Cache transformed image (1 year TTL)
   └── Return response

5. Log usage to D1 (async, non-blocking)
```

### Upload Flow

```
1. Client requests upload URL from API
   POST /api/v1/images/upload-url
   
2. API generates presigned R2 URL
   └── Returns { uploadUrl, imageUrl }

3. Client uploads directly to R2
   PUT {uploadUrl} with image data

4. Client uses imageUrl via CDN
   https://cdn.imgfast.io/pk_xxx/uploaded/image.jpg
```

---

## Scaling Considerations

### Edge Worker
- Auto-scales with Cloudflare
- No cold starts
- 300+ POPs globally

### API
- Railway auto-scaling available
- PostgreSQL connection pooling
- Horizontal scaling ready

### Storage
- R2: Unlimited storage, no egress fees
- D1: 10GB free, then $0.75/GB
- KV: 1GB free, then $0.50/GB

---

## Security

### API Authentication
- JWT tokens for dashboard users
- API keys for CDN access (public_key/secret_key)

### Edge Security
- Domain restrictions per customer
- Referrer validation
- Rate limiting
- Signed URLs (premium feature)

### Data Protection
- All traffic over HTTPS
- Secrets in environment variables
- No sensitive data in logs
