# Imgfast Deployment Guide

## Production URLs

| Service | URL | Platform |
|---------|-----|----------|
| **Dashboard** | https://app.imgfast.io | Cloudflare Pages |
| **API** | https://api.imgfast.io | Railway |
| **CDN** | https://cdn.imgfast.io | Cloudflare Workers |

### Backup/Dev URLs
- Dashboard: https://imgfast-dashboard.pages.dev
- API: https://imgfast-production.up.railway.app
- CDN: https://imgfast.onebeta51.workers.dev

---

## Infrastructure

### Cloudflare Resources

| Resource | Type | ID/Name |
|----------|------|---------|
| R2 Bucket | Storage | `imgfast-images` |
| D1 Database | SQL | `eb96a086-b790-4093-988f-1a6fa857dec7` |
| KV Namespace | Key-Value | `ab29dbb62df849759ba652d4144ba2b6` |
| Workers Subdomain | - | `onebeta51.workers.dev` |

### Railway Resources

| Resource | Value |
|----------|-------|
| Project | `courageous-imagination` |
| Service | `imgfast` |
| Database | PostgreSQL (auto-provisioned) |
| Region | `us-west1` |

---

## DNS Configuration

All DNS records are managed in Cloudflare for `imgfast.io`:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `api` | `s67706an.up.railway.app` | OFF (DNS only) |
| CNAME | `app` | Cloudflare Pages (auto) | ON |
| CNAME | `cdn` | Cloudflare Workers (auto) | ON |

---

## Deployment Commands

### Dashboard (Cloudflare Pages)
```bash
# Automatic on push to main
# Manual trigger: Cloudflare Dashboard → Pages → imgfast-dashboard → Deployments → Retry
```

**Build Settings:**
- Build command: `pnpm run build:dashboard`
- Build output: `apps/dashboard/out`
- Framework: None (static export)

### API (Railway)
```bash
# Automatic on push to main
# Build: pnpm install && pnpm run build:api
# Start: cd apps/api && pnpm run start:prod
```

### Edge Worker (Cloudflare Workers)
```bash
# Automatic on push to main via Cloudflare dashboard
# Manual deploy:
cd apps/edge-worker
npx wrangler deploy
```

---

## Environment Variables

### Railway API (.env)

```env
# Auto-injected by Railway
DATABASE_URL=postgresql://...

# Required secrets (set in Railway dashboard)
NODE_ENV=production
JWT_SECRET=<random-32-chars>
API_SECRET_KEY=<random-32-chars>
CORS_ORIGINS=https://app.imgfast.io
DASHBOARD_URL=https://app.imgfast.io
CDN_BASE_URL=https://cdn.imgfast.io
URL_SIGNING_SECRET=<random-32-chars>

# Stripe (when ready)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# R2 (when ready)
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET_NAME=imgfast-images
```

### Cloudflare Pages (Dashboard)

```env
NEXT_PUBLIC_API_URL=https://imgfast-production.up.railway.app
NEXT_PUBLIC_CDN_URL=https://imgfast.onebeta51.workers.dev
```

### Cloudflare Workers (Edge Worker)

Set via `wrangler secret put` or Cloudflare Dashboard:

```env
API_SECRET_KEY=<same-as-railway>
BACKEND_API_URL=https://api.imgfast.io
URL_SIGNING_SECRET=<same-as-railway>
```

---

## Monitoring

### Health Endpoints

```bash
# API Health
curl https://api.imgfast.io/api/v1/health

# CDN Health
curl https://cdn.imgfast.io/

# Dashboard
curl https://app.imgfast.io/
```

### Logs

- **Railway**: Dashboard → Observability → Logs
- **Cloudflare Workers**: Dashboard → Workers → imgfast → Logs
- **Cloudflare Pages**: Dashboard → Pages → imgfast-dashboard → Deployments → View details

---

## Troubleshooting

### Common Issues

1. **API 404**: Check route is `/api/v1/...` (versioned)
2. **Dashboard 404**: Ensure `output: 'export'` in next.config.js
3. **Worker bindings missing**: Check wrangler.toml has correct IDs
4. **Database connection failed**: Verify DATABASE_URL in Railway

### Redeployment

```bash
# Force redeploy all
git commit --allow-empty -m "chore: trigger redeploy"
git push origin main
```
