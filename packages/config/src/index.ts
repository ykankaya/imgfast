/**
 * Shared configuration constants for ImageCDN platform
 */

// Plan Limits Configuration
export const PLAN_LIMITS = {
  free: {
    maxRequestsPerMonth: 10_000,
    maxBandwidthPerMonth: 1 * 1024 * 1024 * 1024, // 1 GB
    maxImageWidth: 2048,
    maxImageHeight: 2048,
    maxFileSize: 10 * 1024 * 1024, // 10 MB
    rateLimit: 10, // requests per second
  },
  starter: {
    maxRequestsPerMonth: 100_000,
    maxBandwidthPerMonth: 10 * 1024 * 1024 * 1024, // 10 GB
    maxImageWidth: 4096,
    maxImageHeight: 4096,
    maxFileSize: 25 * 1024 * 1024, // 25 MB
    rateLimit: 50,
  },
  pro: {
    maxRequestsPerMonth: 500_000,
    maxBandwidthPerMonth: 50 * 1024 * 1024 * 1024, // 50 GB
    maxImageWidth: 8192,
    maxImageHeight: 8192,
    maxFileSize: 50 * 1024 * 1024, // 50 MB
    rateLimit: 100,
  },
  enterprise: {
    maxRequestsPerMonth: 5_000_000,
    maxBandwidthPerMonth: 500 * 1024 * 1024 * 1024, // 500 GB
    maxImageWidth: 16384,
    maxImageHeight: 16384,
    maxFileSize: 100 * 1024 * 1024, // 100 MB
    rateLimit: 500,
  },
} as const;

// Plan Features Configuration
export const PLAN_FEATURES = {
  free: {
    signedUrls: false,
    customDomains: false,
    avifSupport: false,
    removeWatermark: false,
    priorityProcessing: false,
  },
  starter: {
    signedUrls: false,
    customDomains: true,
    avifSupport: true,
    removeWatermark: true,
    priorityProcessing: false,
  },
  pro: {
    signedUrls: true,
    customDomains: true,
    avifSupport: true,
    removeWatermark: true,
    priorityProcessing: true,
  },
  enterprise: {
    signedUrls: true,
    customDomains: true,
    avifSupport: true,
    removeWatermark: true,
    priorityProcessing: true,
  },
} as const;

// Image Processing Defaults
export const IMAGE_DEFAULTS = {
  quality: 80,
  format: 'auto' as const,
  fit: 'cover' as const,
  gravity: 'center' as const,
  cacheTtl: 31536000, // 1 year in seconds
};

// Supported Image Formats
export const SUPPORTED_INPUT_FORMATS = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
] as const;

export const SUPPORTED_OUTPUT_FORMATS = ['jpeg', 'png', 'webp', 'avif'] as const;

// URL Parameter Aliases
export const PARAM_ALIASES: Record<string, string> = {
  w: 'width',
  h: 'height',
  q: 'quality',
  f: 'format',
  g: 'gravity',
};

// Cache Key Prefixes
export const CACHE_PREFIXES = {
  customer: 'customer:',
  rateLimit: 'ratelimit:',
  quota: 'quota:',
  image: 'imagecdn:',
} as const;

// API Key Prefixes
export const API_KEY_PREFIXES = {
  publicKey: 'imgfast_pk_',
  secretKey: 'imgfast_sk_',
} as const;

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  NOT_MODIFIED: 304,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Error Codes
export const ERROR_CODES = {
  INVALID_API_KEY: 'INVALID_API_KEY',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  IMAGE_NOT_FOUND: 'IMAGE_NOT_FOUND',
  INVALID_PARAMS: 'INVALID_PARAMS',
  TRANSFORM_FAILED: 'TRANSFORM_FAILED',
  DOMAIN_NOT_ALLOWED: 'DOMAIN_NOT_ALLOWED',
} as const;
