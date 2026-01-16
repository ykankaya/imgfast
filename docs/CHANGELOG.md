# Changelog

All notable changes to Imgfast will be documented in this file.

## [0.1.0] - 2026-01-16

### 🎉 Initial MVP Release

First production deployment of Imgfast platform.

### Added

#### Infrastructure
- Cloudflare Pages deployment for dashboard
- Railway deployment for API with PostgreSQL
- Cloudflare Workers deployment for edge CDN
- R2 bucket `imgfast-images` for image storage
- D1 database `imgfast-usage` for usage tracking
- KV namespace `imgfast-cache` for caching

#### Custom Domains
- `app.imgfast.io` → Dashboard
- `api.imgfast.io` → Backend API
- `cdn.imgfast.io` → Edge Worker CDN

#### Dashboard Features
- Landing page with pricing
- Login/Signup pages (UI only)
- Dashboard overview
- API keys management page
- Usage statistics page
- Settings page

#### API Endpoints
- Health check endpoints
- Authentication (login, me, api-keys)
- Customer management
- Billing endpoints (plans, checkout, portal)
- Usage endpoints (current, details, history, quota)
- Image management (upload-url, list, delete)
- Internal endpoints for edge worker
- Stripe webhook handler

#### Edge Worker
- Basic request handling
- R2, KV, D1 bindings configured
- Route configuration for cdn.imgfast.io

### Changed

#### Rebrand
- Renamed from ImageCDN to Imgfast
- Updated package names: `@imagecdn/*` → `@imgfast/*`
- Domain: imgfast.io

#### Database
- Switched from SQLite to PostgreSQL for production
- Prisma schema updated for PostgreSQL compatibility

#### Build Configuration
- Added `output: 'export'` to Next.js for static deployment
- Added separate build scripts: `build:dashboard`, `build:api`, `build:edge`
- Configured Railway for monorepo pnpm workspace support

### Fixed
- pnpm-lock.yaml sync after rebrand
- Railway pnpm workspace:* dependency resolution
- Cloudflare Pages build output directory
- Prisma DATABASE_URL availability at runtime vs build time

---

## Deployment History

### 2026-01-16

| Time | Event |
|------|-------|
| 10:38 | Initial Cloudflare build attempt (failed - lockfile) |
| 10:40 | Fixed pnpm-lock.yaml |
| 10:42 | Cloudflare deploy command error |
| 11:47 | Railway API first successful start |
| 11:52 | Fixed Prisma SQLite → PostgreSQL |
| 12:34 | Dashboard deployed successfully |
| 12:40 | All custom domains configured |
| 12:55 | D1, KV, R2 resources created |

---

## Upcoming

### [0.2.0] - Planned

- [ ] Stripe billing integration
- [ ] Image upload via R2
- [ ] Edge worker image transformation
- [ ] Usage tracking in D1
- [ ] Rate limiting

### [0.3.0] - Planned

- [ ] User authentication flow
- [ ] Email verification
- [ ] Password reset
- [ ] API key rotation

### [1.0.0] - Planned

- [ ] Production hardening
- [ ] Monitoring & alerts
- [ ] Documentation site
- [ ] WordPress plugin
- [ ] React SDK
