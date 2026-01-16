# Imgfast TODO

## Priority 1 - Immediate

### UI/Branding
- [ ] Rebrand "ImageCDN" → "Imgfast" in dashboard
- [ ] Update logo
- [ ] Update page titles
- [ ] Update footer copyright

### Edge Worker Secrets
- [ ] Set `API_SECRET_KEY` via wrangler
- [ ] Set `BACKEND_API_URL` via wrangler
- [ ] Set `URL_SIGNING_SECRET` via wrangler

### Database
- [ ] Run D1 migration for usage schema
- [ ] Verify PostgreSQL tables created

---

## Priority 2 - Core Features

### Image Upload
- [ ] Create R2 API token
- [ ] Add R2 credentials to Railway
- [ ] Test presigned URL generation
- [ ] Test direct upload to R2

### Image Transformation
- [ ] Implement transform logic in edge worker
- [ ] Test resize parameters (w, h)
- [ ] Test format conversion (webp, avif)
- [ ] Test quality parameter

### Authentication
- [ ] Implement signup flow
- [ ] Implement login flow
- [ ] Email verification
- [ ] Password reset

---

## Priority 3 - Billing

### Stripe Integration
- [ ] Create Stripe account/products
- [ ] Add Stripe keys to Railway
- [ ] Implement checkout flow
- [ ] Implement customer portal
- [ ] Set up webhooks
- [ ] Test subscription lifecycle

---

## Priority 4 - Production Hardening

### Monitoring
- [ ] Set up error tracking (Sentry?)
- [ ] Configure Railway alerts
- [ ] Set up uptime monitoring
- [ ] Create status page

### Security
- [ ] Rate limiting in KV
- [ ] Domain validation
- [ ] Referrer validation
- [ ] Request signing

### Performance
- [ ] Cache optimization
- [ ] Image optimization tuning
- [ ] Database query optimization

---

## Priority 5 - Integrations

### SDKs & Plugins
- [ ] React SDK
- [ ] WordPress plugin
- [ ] Shopify app
- [ ] Next.js integration

### Documentation
- [ ] API documentation
- [ ] Integration guides
- [ ] Pricing page content
- [ ] Help center

---

## Completed ✅

### 2026-01-16
- [x] Deploy API to Railway
- [x] Deploy Dashboard to Cloudflare Pages
- [x] Deploy Edge Worker to Cloudflare Workers
- [x] Create R2 bucket
- [x] Create D1 database
- [x] Create KV namespace
- [x] Configure custom domains
- [x] Set up DNS records
- [x] Fix pnpm lockfile
- [x] Fix Prisma PostgreSQL
- [x] Fix Next.js static export
