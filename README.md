# ImageCDN

A subscription-based, global CDN and image optimization SaaS platform — the **Stripe of image delivery**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com/)

## Overview

ImageCDN is an edge-first image optimization platform competing with Cloudinary, ImageKit, and imgix. Built for developers, agencies, and e-commerce businesses who need fast, reliable image delivery without infrastructure complexity.

### Key Features

- **Edge-First Architecture** - Image transformation at 200+ Cloudflare edge locations
- **Auto Optimization** - WebP/AVIF conversion based on browser support
- **Smart Caching** - 90%+ cache hit ratio with intelligent cache keys
- **Usage-Based Billing** - Stripe integration with subscription plans and overage billing
- **CMS Plugins** - WordPress plugin ready, Shopify coming soon
- **Signed URLs** - Secure image access with HMAC-SHA256 signatures
- **Real-time Analytics** - Usage tracking and quota monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Request                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge (200+ PoPs)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Auth/Rate   │→ │  Transform  │→ │  Cache & Deliver        │  │
│  │ Limiting    │  │  (Workers)  │  │  (Cache API)            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Cache Miss
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare R2 Storage                       │
│                    (Zero egress fees)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend API (NestJS)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐   │
│  │  Auth    │  │ Billing  │  │  Usage   │  │  Webhooks      │   │
│  │  Module  │  │ (Stripe) │  │ Tracking │  │  (Stripe)      │   │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
imagecdn/
├── apps/
│   ├── edge-worker/          # Cloudflare Worker (image delivery)
│   │   ├── src/
│   │   │   ├── handlers/     # Request handlers
│   │   │   ├── middleware/   # Auth, rate limiting
│   │   │   ├── services/     # Transform, cache, usage
│   │   │   └── utils/        # Response, signing utilities
│   │   └── wrangler.toml
│   │
│   ├── api/                  # NestJS Backend API
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/     # JWT & API key authentication
│   │   │   │   ├── billing/  # Stripe subscriptions & metered billing
│   │   │   │   ├── customers/# Customer management
│   │   │   │   ├── images/   # Image management
│   │   │   │   ├── usage/    # Usage tracking & analytics
│   │   │   │   ├── webhooks/ # Stripe webhook handlers
│   │   │   │   └── internal/ # Edge worker internal API
│   │   │   └── common/       # Shared utilities
│   │   └── prisma/           # Database schema
│   │
│   └── dashboard/            # Next.js Frontend
│       ├── src/
│       │   ├── app/          # App router pages
│       │   └── components/   # React components
│       └── tailwind.config.ts
│
├── packages/
│   ├── shared-types/         # TypeScript definitions
│   ├── config/               # Shared ESLint, TypeScript configs
│   └── utils/                # Shared utility functions
│
├── plugins/
│   └── wordpress/            # WordPress Plugin
│       └── imagecdn-optimizer/
│           ├── includes/     # PHP classes
│           ├── admin/        # Admin assets
│           ├── blocks/       # Gutenberg blocks
│           └── languages/    # i18n
│
└── docs/                     # Documentation
    ├── architecture/
    ├── investor-pitch.md
    └── stripe-webhook-setup.md
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 9+
- Cloudflare account (Workers, R2, KV, D1)
- Stripe account
- PostgreSQL database

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/imagecdn.git
cd imagecdn

# Install dependencies
pnpm install

# Generate Prisma client
pnpm --filter @imagecdn/api db:generate

# Build all packages
pnpm build
```

### Environment Setup

```bash
# Backend API
cp apps/api/.env.example apps/api/.env

# Dashboard
cp apps/dashboard/.env.example apps/dashboard/.env.local

# Edge Worker
cp apps/edge-worker/.dev.vars.example apps/edge-worker/.dev.vars
```

Required environment variables:

```env
# Backend API
DATABASE_URL=postgresql://...
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
JWT_SECRET=your-jwt-secret
API_SECRET_KEY=internal-api-key

# Dashboard
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_CDN_URL=https://cdn.imagecdn.io

# Edge Worker
ENVIRONMENT=development
BACKEND_API_URL=http://localhost:3001
API_SECRET_KEY=internal-api-key
```

### Development

```bash
# Start all services
pnpm dev

# Or start individually
pnpm --filter @imagecdn/api dev          # Backend (port 3001)
pnpm --filter @imagecdn/dashboard dev    # Dashboard (port 3000)
pnpm --filter @imagecdn/edge-worker dev  # Worker (port 8787)
```

## Usage

### URL Format

```
https://cdn.imagecdn.io/{public_key}/{image_path}?{params}
```

### Transformation Parameters

| Param | Description | Example |
|-------|-------------|---------|
| `w` | Width in pixels | `w=800` |
| `h` | Height in pixels | `h=600` |
| `q` | Quality (1-100) | `q=80` |
| `f` | Format (auto/webp/avif/jpeg/png) | `f=auto` |
| `fit` | Resize mode (cover/contain/fill) | `fit=cover` |
| `g` | Gravity (center/north/south/east/west/auto) | `g=center` |
| `blur` | Blur amount (1-100) | `blur=10` |
| `sharp` | Sharpen amount (1-100) | `sharp=5` |

### Signed URLs (Pro/Enterprise)

```
/{public_key}/{path}?w=800&q=80&exp={timestamp}&sig={signature}
```

### Examples

```html
<!-- Basic resize -->
<img src="https://cdn.imagecdn.io/imgcdn_pk_xxx/hero.jpg?w=800&h=600" />

<!-- Auto format with quality -->
<img src="https://cdn.imagecdn.io/imgcdn_pk_xxx/hero.jpg?w=1200&q=85&f=auto" />

<!-- Thumbnail with crop -->
<img src="https://cdn.imagecdn.io/imgcdn_pk_xxx/hero.jpg?w=200&h=200&fit=cover&g=center" />
```

## API Reference

### Authentication

All API requests require authentication via JWT token or API key:

```bash
# JWT Token (Dashboard users)
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

# API Key (Server-to-server)
X-API-Key: imgcdn_sk_xxxxxxxxxxxxx
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/auth/register` | Create account |
| `POST` | `/v1/auth/login` | Get JWT token |
| `GET` | `/v1/customers/me` | Get current customer |
| `GET` | `/v1/usage` | Get usage statistics |
| `GET` | `/v1/billing/plans` | List pricing plans |
| `POST` | `/v1/billing/checkout` | Create checkout session |
| `POST` | `/v1/billing/portal` | Access billing portal |
| `GET` | `/v1/images` | List uploaded images |
| `POST` | `/v1/images/upload` | Upload image |

## WordPress Plugin

### Installation

1. Download `imagecdn-optimizer.zip`
2. Upload via WordPress Admin → Plugins → Add New
3. Activate the plugin
4. Go to Settings → ImageCDN
5. Enter your API key

### Features

- Automatic URL rewriting for all images
- WebP/AVIF auto-conversion
- Responsive image srcset support
- Native lazy loading
- Gutenberg block for advanced control
- Custom domain support (Pro)

## Pricing Plans

| Plan | Requests/mo | Bandwidth | Features | Price |
|------|-------------|-----------|----------|-------|
| **Free** | 10K | 1 GB | Basic transforms | $0 |
| **Starter** | 100K | 10 GB | + Custom domains, AVIF | $19/mo |
| **Pro** | 500K | 50 GB | + Signed URLs, Priority | $49/mo |
| **Enterprise** | 5M | 500 GB | + SLA, Dedicated support | $199/mo |

### Overage Pricing

| Plan | Per 1K Requests | Per GB Bandwidth |
|------|-----------------|------------------|
| Free | $0.50 | $0.15 |
| Starter | $0.40 | $0.12 |
| Pro | $0.30 | $0.10 |
| Enterprise | $0.20 | $0.08 |

## Deployment

### Edge Worker (Cloudflare)

```bash
cd apps/edge-worker

# Configure wrangler.toml with your account

# Deploy to staging
wrangler deploy --env staging

# Deploy to production
wrangler deploy --env production
```

### Backend API

```bash
cd apps/api

# Build
pnpm build

# Run database migrations
pnpm db:migrate

# Start production server
pnpm start:prod
```

### Dashboard (Vercel)

```bash
cd apps/dashboard
vercel --prod
```

## Stripe Webhook Setup

1. Create webhook endpoint in Stripe Dashboard
2. Point to: `https://api.yourdomain.com/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.*`
   - `invoice.*`
4. Copy webhook secret to `STRIPE_WEBHOOK_SECRET`

See [docs/stripe-webhook-setup.md](docs/stripe-webhook-setup.md) for detailed instructions.

## Development Status

### Completed

- [x] Monorepo setup (pnpm workspaces + Turborepo)
- [x] Edge Worker with image transformation
- [x] Authentication flow (API key validation, signed URLs)
- [x] Rate limiting and quota management
- [x] Backend API (NestJS + Prisma)
- [x] Stripe billing integration
- [x] Webhook handling (20+ event types)
- [x] Usage-based metered billing
- [x] WordPress plugin (core functionality)
- [x] Dashboard UI (Next.js)

### In Progress

- [ ] Shopify app
- [ ] React/Vue SDKs
- [ ] Advanced analytics dashboard
- [ ] Custom domain SSL provisioning

### Planned

- [ ] Webflow integration
- [ ] Wix integration
- [ ] Video optimization
- [ ] AI-powered cropping

## Documentation

- [Architecture Overview](docs/architecture/overview.md)
- [Engineering Guidelines](docs/engineering-guidelines.md)
- [WordPress Plugin Specification](docs/wordpress-plugin-specification.md)
- [WordPress Plugin Architecture](docs/architecture/wordpress-plugin.md)
- [Stripe Webhook Setup](docs/stripe-webhook-setup.md)
- [Investor Pitch](docs/investor-pitch.md)
- [API Reference](docs/api-reference.md) *(coming soon)*

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

### Code Style

- TypeScript strict mode
- ESLint + Prettier
- Conventional commits

```bash
# Lint all packages
pnpm lint

# Format code
pnpm format

# Type check
pnpm typecheck
```

## Support

- Documentation: [docs.imagecdn.io](https://docs.imagecdn.io)
- Email: support@imagecdn.io
- Discord: [Join our community](https://discord.gg/imagecdn)

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**ImageCDN** — *Fast images, everywhere.*
