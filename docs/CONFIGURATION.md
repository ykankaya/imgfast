# Imgfast Configuration Reference

## Environment Variables

### API (Railway)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string | Auto-injected by Railway |
| `NODE_ENV` | Yes | Environment | `production` |
| `PORT` | No | Server port | `3001` (default) |
| `JWT_SECRET` | Yes | JWT signing key | 32+ random chars |
| `JWT_EXPIRES_IN` | No | Token expiry | `7d` (default) |
| `API_SECRET_KEY` | Yes | Internal API auth | 32+ random chars |
| `CORS_ORIGINS` | Yes | Allowed origins | `https://app.imgfast.io` |
| `DASHBOARD_URL` | Yes | Dashboard URL | `https://app.imgfast.io` |
| `CDN_BASE_URL` | Yes | CDN URL | `https://cdn.imgfast.io` |
| `URL_SIGNING_SECRET` | Yes | URL signature key | 32+ random chars |
| `STRIPE_SECRET_KEY` | No | Stripe API key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook | `whsec_...` |
| `R2_ENDPOINT` | No | R2 endpoint | `https://<id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | No | R2 access key | From Cloudflare |
| `R2_SECRET_ACCESS_KEY` | No | R2 secret | From Cloudflare |
| `R2_BUCKET_NAME` | No | R2 bucket | `imgfast-images` |

### Dashboard (Cloudflare Pages)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Yes | API base URL | `https://api.imgfast.io` |
| `NEXT_PUBLIC_CDN_URL` | Yes | CDN base URL | `https://cdn.imgfast.io` |

### Edge Worker (Cloudflare Workers)

#### Secrets (via wrangler secret put)

| Secret | Required | Description |
|--------|----------|-------------|
| `API_SECRET_KEY` | Yes | Must match API's API_SECRET_KEY |
| `BACKEND_API_URL` | Yes | API URL for customer lookup |
| `URL_SIGNING_SECRET` | Yes | Must match API's URL_SIGNING_SECRET |

#### Vars (in wrangler.toml)

| Variable | Description | Default |
|----------|-------------|---------|
| `MAX_IMAGE_WIDTH` | Max resize width | `4096` |
| `MAX_IMAGE_HEIGHT` | Max resize height | `4096` |
| `MAX_FILE_SIZE_MB` | Max file size | `50` |
| `DEFAULT_QUALITY` | Default JPEG quality | `80` |
| `CACHE_TTL_SECONDS` | Cache duration | `31536000` (1 year) |
| `ENVIRONMENT` | Environment name | `production` |

---

## Cloudflare Resource IDs

### Production

```toml
# wrangler.toml

[[d1_databases]]
binding = "USAGE_DB"
database_name = "imgfast-usage"
database_id = "eb96a086-b790-4093-988f-1a6fa857dec7"

[[kv_namespaces]]
binding = "CACHE_KV"
id = "ab29dbb62df849759ba652d4144ba2b6"

[[r2_buckets]]
binding = "IMAGES_BUCKET"
bucket_name = "imgfast-images"
```

---

## Build Commands

### Root package.json

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "build:dashboard": "turbo build --filter=@imgfast/dashboard",
    "build:api": "turbo build --filter=@imgfast/api",
    "build:edge": "turbo build --filter=@imgfast/edge-worker"
  }
}
```

### API (apps/api/package.json)

```json
{
  "scripts": {
    "build": "prisma generate && nest build",
    "start:prod": "prisma db push && node dist/main"
  }
}
```

### Dashboard (apps/dashboard/package.json)

```json
{
  "scripts": {
    "build": "next build"
  }
}
```

### Edge Worker (apps/edge-worker/package.json)

```json
{
  "scripts": {
    "build": "wrangler deploy --dry-run --outdir=dist"
  }
}
```

---

## Next.js Configuration

### apps/dashboard/next.config.js

```javascript
const nextConfig = {
  output: 'export',           // Static export for Cloudflare Pages
  reactStrictMode: true,
  transpilePackages: ['@imgfast/shared-types'],
  images: {
    unoptimized: true,        // No Next.js image optimization
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.imgfast.io',
      },
    ],
  },
  trailingSlash: true,        // Required for static hosting
};
```

---

## Railway Configuration

### railway.json

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install --frozen-lockfile && pnpm run build:api"
  },
  "deploy": {
    "startCommand": "cd apps/api && pnpm run start:prod",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

---

## Prisma Configuration

### apps/api/prisma/schema.prisma

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```

---

## Generate Secrets

```bash
# Generate random 32-byte hex string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or using openssl
openssl rand -hex 32
```

Generate separate secrets for:
- `JWT_SECRET`
- `API_SECRET_KEY`
- `URL_SIGNING_SECRET`
