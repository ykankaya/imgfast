# Imgfast Deployment Guide

Bu rehber, Imgfast projesinin production'a deploy edilmesi için gereken tüm adımları içerir.

---

## 1. Gerekli Hesaplar

| Hesap | URL | Amaç |
|-------|-----|------|
| Cloudflare | https://dash.cloudflare.com | CDN, Workers, R2, KV, D1 |
| Stripe | https://dashboard.stripe.com | Ödeme sistemi |
| Railway | https://railway.app | Backend API hosting |
| Vercel | https://vercel.com | Dashboard hosting |
| GitHub | https://github.com | Kod repository |
| Neon/Supabase | https://neon.tech | PostgreSQL veritabanı |

---

## 2. Domain Yapısı

| Subdomain | Kullanım |
|-----------|----------|
| imgfast.io | Ana website |
| cdn.imgfast.io | CDN endpoint (Cloudflare Worker) |
| api.imgfast.io | Backend API |
| app.imgfast.io | Dashboard |

---

## 3. Cloudflare Ayarları

### 3.1 API Token Oluşturma

1. https://dash.cloudflare.com/profile/api-tokens adresine gidin
2. **"Create Token"** tıklayın
3. **"Edit Cloudflare Workers"** template → **"Use template"**
4. Permissions'a şunları ekleyin:
   - Account → Workers Scripts → Edit
   - Account → Workers KV Storage → Edit
   - Account → Workers R2 Storage → Edit
   - Account → D1 → Edit
   - Zone → Workers Routes → Edit
5. **"Continue to summary"** → **"Create Token"**
6. Token'ı kopyalayın (bir kez gösterilir!)

### 3.2 R2 Bucket Oluşturma

1. Cloudflare Dashboard → R2
2. **"Create bucket"** tıklayın
3. Bucket name: `imgfast-images`
4. Location: Auto veya yakın bölge

### 3.3 KV Namespace Oluşturma

1. Cloudflare Dashboard → Workers & Pages → KV
2. **"Create a namespace"** tıklayın
3. Name: `imgfast-cache`

### 3.4 D1 Database Oluşturma

1. Cloudflare Dashboard → Workers & Pages → D1
2. **"Create database"** tıklayın
3. Name: `imgfast-usage`

### 3.5 Wrangler.toml Güncelleme

Oluşturduğunuz kaynakların ID'lerini `apps/edge-worker/wrangler.toml` dosyasına ekleyin:

```toml
[[r2_buckets]]
binding = "IMAGES_BUCKET"
bucket_name = "imgfast-images"

[[kv_namespaces]]
binding = "CACHE_KV"
id = "your-kv-namespace-id"

[[d1_databases]]
binding = "USAGE_DB"
database_name = "imgfast-usage"
database_id = "your-d1-database-id"
```

---

## 4. GitHub Secrets

GitHub Repo → Settings → Secrets and variables → Actions → New repository secret

| Secret Name | Nereden Alınır |
|-------------|----------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → Profile → API Tokens |
| `RAILWAY_TOKEN` | Railway → Account Settings → Tokens |
| `VERCEL_TOKEN` | Vercel → Settings → Tokens |

### 4.1 Cloudflare API Token

```
Name: CLOUDFLARE_API_TOKEN
Secret: [Cloudflare'den aldığınız token]
```

### 4.2 Railway Token

1. https://railway.app/account/tokens adresine gidin
2. **"Create Token"** tıklayın
3. İsim verin: `imgfast-deploy`
4. Token'ı kopyalayın

```
Name: RAILWAY_TOKEN
Secret: [Railway'den aldığınız token]
```

### 4.3 Vercel Token (Opsiyonel)

1. https://vercel.com/account/tokens adresine gidin
2. **"Create"** tıklayın
3. İsim: `imgfast-github`
4. Scope: Full Account

```
Name: VERCEL_TOKEN
Secret: [Vercel'den aldığınız token]
```

---

## 5. Stripe Ayarları

### 5.1 Hesap Oluşturma

1. https://dashboard.stripe.com/register adresine gidin
2. Hesap oluşturun ve doğrulayın

### 5.2 Products/Prices Oluşturma

Products → Add Product ile şu planları oluşturun:

| Plan | Fiyat | Requests/ay | Bandwidth |
|------|-------|-------------|-----------|
| Free | $0 | 10K | 1 GB |
| Starter | $19/ay | 100K | 10 GB |
| Pro | $49/ay | 500K | 50 GB |
| Enterprise | $199/ay | 5M | 500 GB |

### 5.3 Webhook Ayarlama

1. Developers → Webhooks → Add endpoint
2. URL: `https://api.imgfast.io/webhooks/stripe`
3. Events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Webhook secret'ı kopyalayın

### 5.4 API Keys

Developers → API Keys:
- **Publishable key:** `pk_live_xxx` (frontend için)
- **Secret key:** `sk_live_xxx` (backend için)

---

## 6. Backend API (Railway) Deployment

### 6.1 Railway Projesi Oluşturma

1. https://railway.app/new adresine gidin
2. **"Deploy from GitHub repo"** seçin
3. `ykankaya/imgfast` reposunu seçin
4. Root Directory: `apps/api`

### 6.2 Environment Variables

Railway dashboard'da şu environment variables'ları ekleyin:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=<random-32-char-string>
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=imgfast-images
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
API_SECRET_KEY=<internal-api-key>
```

### 6.3 Custom Domain

1. Railway → Settings → Domains
2. **"Add Domain"** → `api.imgfast.io`
3. Cloudflare DNS'de CNAME ekleyin

---

## 7. Dashboard (Vercel) Deployment

### 7.1 Vercel Projesi Oluşturma

1. https://vercel.com/new adresine gidin
2. GitHub repo'yu import edin: `ykankaya/imgfast`
3. Framework Preset: Next.js
4. Root Directory: `apps/dashboard`

### 7.2 Environment Variables

```env
NEXT_PUBLIC_API_URL=https://api.imgfast.io
NEXT_PUBLIC_CDN_URL=https://cdn.imgfast.io
```

### 7.3 Custom Domain

1. Vercel → Settings → Domains
2. **"Add"** → `app.imgfast.io`
3. Cloudflare DNS'de CNAME ekleyin

---

## 8. Edge Worker (Cloudflare) Deployment

### 8.1 Wrangler CLI ile Deploy

```bash
cd apps/edge-worker
npx wrangler deploy --env production
```

### 8.2 GitHub Actions ile Otomatik Deploy

GitHub Secrets ayarlandığında, `main` branch'e push edildiğinde otomatik deploy olur.

---

## 9. DNS Ayarları (Cloudflare)

Cloudflare DNS dashboard'da şu kayıtları ekleyin:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | cdn | imgfast-edge.workers.dev | ✅ |
| CNAME | api | [railway-domain].railway.app | ❌ |
| CNAME | app | cname.vercel-dns.com | ❌ |

---

## 10. Deployment Sırası

```
1. ✅ GitHub repo oluştur ve kodu push et
2. ✅ Repo'yu public yap
3. ✅ Branch protection ekle
4. ⬜ Cloudflare'de domain ekle
5. ⬜ Cloudflare API Token oluştur
6. ⬜ GitHub Secrets ekle (CLOUDFLARE_API_TOKEN)
7. ⬜ Cloudflare R2, KV, D1 oluştur
8. ⬜ Wrangler.toml'u ID'lerle güncelle
9. ⬜ Neon/Supabase'de PostgreSQL oluştur
10. ⬜ Railway'de API deploy et
11. ⬜ Vercel'de Dashboard deploy et
12. ⬜ Edge Worker deploy et
13. ⬜ DNS ayarlarını yap
14. ⬜ Stripe hesabı aç ve ayarla
15. ⬜ Stripe webhook'u test et
16. ⬜ E2E test yap
```

---

## 11. Environment Variables Özeti

### Edge Worker (wrangler.toml secrets)
```
API_SECRET_KEY=internal-api-key
BACKEND_API_URL=https://api.imgfast.io
```

### Backend API (.env)
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-jwt-secret
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=imgfast-images
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
API_SECRET_KEY=internal-api-key
```

### Dashboard (.env.local)
```
NEXT_PUBLIC_API_URL=https://api.imgfast.io
NEXT_PUBLIC_CDN_URL=https://cdn.imgfast.io
```

---

## 12. Tahmini Maliyet

| Servis | Ücretsiz Tier | Ücretli |
|--------|---------------|---------|
| Cloudflare Workers | 100K req/gün | $5/ay |
| Cloudflare R2 | 10GB | $0.015/GB |
| Railway | $5 kredi/ay | $5-20/ay |
| Vercel | Hobby ücretsiz | $20/ay Pro |
| Neon DB | 0.5GB ücretsiz | $19/ay |
| Stripe | - | %2.9 + $0.30/işlem |
| Domain | - | ~$15/yıl |

**Toplam başlangıç:** Ücretsiz tier ile $0, üretime geçince ~$50-100/ay

---

## 13. Troubleshooting

### CI/CD Başarısız Olursa
1. GitHub Actions loglarını kontrol edin
2. Secrets'ların doğru eklendiğinden emin olun
3. `pnpm install` ve `pnpm build` locally çalışıyor mu kontrol edin

### Worker Deploy Hatası
1. Wrangler.toml'daki ID'lerin doğru olduğunu kontrol edin
2. `npx wrangler whoami` ile giriş yapıldığını kontrol edin

### Database Bağlantı Hatası
1. DATABASE_URL'in doğru formatda olduğunu kontrol edin
2. IP allowlist varsa Railway/Vercel IP'lerini ekleyin

---

## 14. Faydalı Linkler

- Cloudflare Workers Docs: https://developers.cloudflare.com/workers/
- Railway Docs: https://docs.railway.app/
- Vercel Docs: https://vercel.com/docs
- Stripe Docs: https://stripe.com/docs
- NestJS Docs: https://docs.nestjs.com/
- Next.js Docs: https://nextjs.org/docs

---

**Son güncelleme:** 2025-01-16
