export interface Env {
  // R2 Bucket
  IMAGES_BUCKET: R2Bucket;

  // KV Namespace for caching and rate limiting
  CACHE_KV: KVNamespace;

  // D1 Database for usage tracking
  USAGE_DB: D1Database;

  // Environment variables
  ENVIRONMENT: 'development' | 'staging' | 'production';
  MAX_IMAGE_WIDTH: string;
  MAX_IMAGE_HEIGHT: string;
  MAX_FILE_SIZE_MB: string;
  DEFAULT_QUALITY: string;
  CACHE_TTL_SECONDS: string;

  // Secrets (set via wrangler secret)
  API_SECRET_KEY?: string;
  BACKEND_API_URL?: string;
}

export interface Customer {
  id: string;
  publicKey: string;
  plan: Plan;
  status: 'active' | 'suspended' | 'cancelled';
  allowedDomains: string[];
  allowedReferrers: string[];
  features: CustomerFeatures;
  limits: CustomerLimits;
}

export interface Plan {
  id: string;
  name: string;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
}

export interface CustomerFeatures {
  signedUrls: boolean;
  customDomains: boolean;
  avifSupport: boolean;
  removeWatermark: boolean;
  priorityProcessing: boolean;
}

export interface CustomerLimits {
  maxRequestsPerMonth: number;
  maxBandwidthPerMonth: number; // in bytes
  maxImageWidth: number;
  maxImageHeight: number;
  maxFileSize: number; // in bytes
  rateLimit: number; // requests per second
}

export interface RequestContext {
  publicKey: string;
  imagePath: string;
  params: Record<string, string>;
  request: Request;
  env: Env;
  ctx: ExecutionContext;
  customer?: Customer;
}

export interface TransformParams {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  gravity?: 'center' | 'north' | 'south' | 'east' | 'west' | 'auto';
  blur?: number;
  sharpen?: number;
  brightness?: number;
  contrast?: number;
  watermark?: boolean;
}

export interface UsageRecord {
  customerId: string;
  publicKey: string;
  timestamp: number;
  requestType: 'transform' | 'cache_hit' | 'origin';
  inputBytes: number;
  outputBytes: number;
  transformParams: string;
  statusCode: number;
  responseTime: number;
  cacheStatus: 'HIT' | 'MISS' | 'BYPASS';
  edgeLocation: string;
}

export interface AuthResult {
  valid: boolean;
  status: number;
  message: string;
  customer?: Customer;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter?: number;
}
