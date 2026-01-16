// Customer & Auth Types
export interface Customer {
  id: string;
  email: string;
  publicKey: string;
  plan: Plan;
  status: CustomerStatus;
  allowedDomains: string[];
  allowedReferrers: string[];
  features: CustomerFeatures;
  limits: CustomerLimits;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CustomerStatus = 'active' | 'suspended' | 'cancelled';

export interface Plan {
  id: string;
  name: string;
  tier: PlanTier;
}

export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface CustomerFeatures {
  signedUrls: boolean;
  customDomains: boolean;
  avifSupport: boolean;
  removeWatermark: boolean;
  priorityProcessing: boolean;
}

export interface CustomerLimits {
  maxRequestsPerMonth: number;
  maxBandwidthPerMonth: number;
  maxImageWidth: number;
  maxImageHeight: number;
  maxFileSize: number;
  rateLimit: number;
}

// Image Transformation Types
export interface TransformParams {
  width?: number;
  height?: number;
  quality?: number;
  format?: ImageFormat;
  fit?: FitMode;
  gravity?: Gravity;
  blur?: number;
  sharpen?: number;
  brightness?: number;
  contrast?: number;
  watermark?: boolean;
}

export type ImageFormat = 'auto' | 'webp' | 'avif' | 'jpeg' | 'png';
export type FitMode = 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
export type Gravity = 'center' | 'north' | 'south' | 'east' | 'west' | 'auto';

// Usage & Analytics Types
export interface UsageRecord {
  customerId: string;
  publicKey: string;
  timestamp: number;
  requestType: RequestType;
  inputBytes: number;
  outputBytes: number;
  transformParams: string;
  statusCode: number;
  responseTime: number;
  cacheStatus: CacheStatus;
  edgeLocation: string;
}

export type RequestType = 'transform' | 'cache_hit' | 'origin';
export type CacheStatus = 'HIT' | 'MISS' | 'BYPASS';

export interface UsageSummary {
  period: string;
  requests: number;
  bandwidth: number;
  cacheHitRate: number;
  transformations: number;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Billing Types
export interface PricingPlan {
  id: string;
  name: string;
  tier: PlanTier;
  priceMonthly: number;
  priceYearly: number;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  features: PlanFeatures;
}

export interface PlanFeatures {
  requestsPerMonth: number;
  bandwidthPerMonth: number;
  maxImageWidth: number;
  maxImageHeight: number;
  maxFileSize: number;
  customDomains: boolean;
  signedUrls: boolean;
  avifSupport: boolean;
  removeWatermark: boolean;
  prioritySupport: boolean;
}

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  planId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'trialing';

// Image Types
export interface ImageInfo {
  key: string;
  size: number;
  contentType: string;
  lastModified: Date;
  metadata?: Record<string, string>;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresAt: Date;
}

// Webhook Types
export interface WebhookEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

// Auth Types
export interface JwtPayload {
  sub: string;
  email: string;
  customerId: string;
  iat?: number;
  exp?: number;
}

export interface ApiKeyPair {
  publicKey: string;
  secretKey: string;
}
