import type { RequestContext, AuthResult, Customer, Env } from '../types';

/**
 * Cache TTL for customer config (5 minutes)
 */
const CUSTOMER_CACHE_TTL = 300;

/**
 * Maximum age for signed URLs (24 hours)
 */
const MAX_SIGNED_URL_AGE = 24 * 60 * 60 * 1000;

/**
 * Main authentication flow.
 * Validates the API key (public key) and retrieves customer configuration.
 * Uses KV for fast edge-cached lookups with backend API as source of truth.
 */
export async function validateApiKey(context: RequestContext): Promise<AuthResult> {
  const { publicKey, env, request, params } = context;

  // Validate public key format
  if (!isValidPublicKeyFormat(publicKey)) {
    return {
      valid: false,
      status: 400,
      message: 'Invalid API key format',
    };
  }

  // Try to get customer from KV cache first
  const cacheKey = `customer:${publicKey}`;
  let customer = await getCachedCustomer(env, cacheKey);

  // Cache miss - fetch from backend
  if (!customer) {
    customer = await fetchCustomerFromBackend(publicKey, env);

    if (customer) {
      // Cache in KV
      await cacheCustomer(env, cacheKey, customer, context.ctx);
    }
  }

  // Customer not found
  if (!customer) {
    return {
      valid: false,
      status: 401,
      message: 'Invalid API key',
    };
  }

  // Check customer status
  const statusResult = validateCustomerStatus(customer);
  if (!statusResult.valid) {
    return statusResult;
  }

  // Check if signed URL is required
  if (customer.features.signedUrls) {
    const signedResult = await validateSignedUrl(context, customer);
    if (!signedResult.valid) {
      return signedResult;
    }
  }

  // Validate domain/referrer restrictions
  const originResult = validateRequestOrigin(request, customer);
  if (!originResult.valid) {
    return originResult;
  }

  return {
    valid: true,
    status: 200,
    message: 'OK',
    customer,
  };
}

/**
 * Validate public key format: imgcdn_pk_{base62}
 */
function isValidPublicKeyFormat(publicKey: string): boolean {
  // Must start with imgcdn_pk_ prefix
  if (!publicKey.startsWith('imgcdn_pk_')) {
    return false;
  }

  // Key part must be alphanumeric and reasonable length
  const keyPart = publicKey.slice(10);
  if (keyPart.length < 8 || keyPart.length > 64) {
    return false;
  }

  return /^[a-zA-Z0-9]+$/.test(keyPart);
}

/**
 * Get customer from KV cache
 */
async function getCachedCustomer(env: Env, cacheKey: string): Promise<Customer | null> {
  try {
    return await env.CACHE_KV.get<Customer>(cacheKey, 'json');
  } catch (error) {
    console.error('KV cache read error:', error);
    return null;
  }
}

/**
 * Cache customer in KV
 */
async function cacheCustomer(
  env: Env,
  cacheKey: string,
  customer: Customer,
  ctx: ExecutionContext
): Promise<void> {
  ctx.waitUntil(
    env.CACHE_KV.put(cacheKey, JSON.stringify(customer), {
      expirationTtl: CUSTOMER_CACHE_TTL,
    }).catch(err => console.error('KV cache write error:', err))
  );
}

/**
 * Fetch customer configuration from backend API
 */
async function fetchCustomerFromBackend(publicKey: string, env: Env): Promise<Customer | null> {
  // In development, return mock customer
  if (env.ENVIRONMENT === 'development') {
    return getMockCustomer(publicKey);
  }

  if (!env.BACKEND_API_URL || !env.API_SECRET_KEY) {
    console.error('Backend API configuration missing');
    return null;
  }

  try {
    const response = await fetch(`${env.BACKEND_API_URL}/internal/customers/by-key/${publicKey}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${env.API_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'X-Worker-Version': '1.0.0',
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      console.error(`Backend API error: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as { customer: Customer };
    return data.customer;
  } catch (error) {
    console.error('Failed to fetch customer:', error);
    return null;
  }
}

/**
 * Validate customer account status
 */
function validateCustomerStatus(customer: Customer): AuthResult {
  switch (customer.status) {
    case 'active':
      return { valid: true, status: 200, message: 'OK' };

    case 'suspended':
      return {
        valid: false,
        status: 402,
        message: 'Account suspended. Please update your payment method.',
      };

    case 'cancelled':
      return {
        valid: false,
        status: 403,
        message: 'Account cancelled. Please contact support to reactivate.',
      };

    default:
      return {
        valid: false,
        status: 403,
        message: 'Account status invalid',
      };
  }
}

/**
 * Validate signed URL for secure image access.
 * URL format: /{public_key}/{image_path}?sig={signature}&exp={expiry}
 *
 * Signature = HMAC-SHA256(secret_key, {public_key}/{image_path}?exp={expiry}&...other_params)
 */
async function validateSignedUrl(context: RequestContext, customer: Customer): Promise<AuthResult> {
  const { params, publicKey, imagePath, env } = context;

  const signature = params.sig || params.signature;
  const expiry = params.exp || params.expires;

  // If no signature provided, check if customer requires signing
  if (!signature) {
    // For customers with signedUrls enabled, signature is required
    return {
      valid: false,
      status: 401,
      message: 'Signed URL required. Missing signature parameter.',
    };
  }

  // Check expiry
  if (!expiry) {
    return {
      valid: false,
      status: 401,
      message: 'Signed URL required. Missing expiry parameter.',
    };
  }

  const expiryTime = parseInt(expiry, 10);
  if (isNaN(expiryTime)) {
    return {
      valid: false,
      status: 400,
      message: 'Invalid expiry timestamp',
    };
  }

  const now = Date.now();

  // Check if expired
  if (expiryTime < now) {
    return {
      valid: false,
      status: 401,
      message: 'Signed URL has expired',
    };
  }

  // Check if too far in future
  if (expiryTime > now + MAX_SIGNED_URL_AGE) {
    return {
      valid: false,
      status: 400,
      message: 'Expiry too far in future',
    };
  }

  // Verify signature
  const isValid = await verifySignature(context, customer, signature, expiryTime);
  if (!isValid) {
    return {
      valid: false,
      status: 401,
      message: 'Invalid signature',
    };
  }

  return { valid: true, status: 200, message: 'OK' };
}

/**
 * Verify HMAC signature
 */
async function verifySignature(
  context: RequestContext,
  customer: Customer,
  providedSignature: string,
  expiry: number
): Promise<boolean> {
  const { publicKey, imagePath, params, env } = context;

  // Get the customer's secret key from backend (cached)
  const secretKey = await getCustomerSecretKey(customer.id, env, context.ctx);
  if (!secretKey) {
    console.error('Could not retrieve secret key for signature verification');
    return false;
  }

  // Build the string to sign
  // Sort params alphabetically, excluding sig/signature
  const paramsToSign: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'sig' && key !== 'signature') {
      paramsToSign.push(`${key}=${value}`);
    }
  }
  paramsToSign.sort();

  const stringToSign = `${publicKey}/${imagePath}?${paramsToSign.join('&')}`;

  // Generate expected signature
  const expectedSignature = await generateHmacSignature(stringToSign, secretKey);

  // Constant-time comparison to prevent timing attacks
  return secureCompare(providedSignature, expectedSignature);
}

/**
 * Get customer's secret key (for signature verification)
 */
async function getCustomerSecretKey(
  customerId: string,
  env: Env,
  ctx: ExecutionContext
): Promise<string | null> {
  const cacheKey = `secret:${customerId}`;

  // Try cache first
  try {
    const cached = await env.CACHE_KV.get(cacheKey);
    if (cached) return cached;
  } catch (error) {
    console.error('KV secret read error:', error);
  }

  // In development mode, return mock secret
  if (env.ENVIRONMENT === 'development') {
    return 'dev-secret-key-for-testing-only';
  }

  // Fetch from backend
  if (!env.BACKEND_API_URL || !env.API_SECRET_KEY) {
    return null;
  }

  try {
    const response = await fetch(`${env.BACKEND_API_URL}/internal/customers/${customerId}/secret`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${env.API_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { secretKey: string };

    // Cache for 1 minute (shorter than customer config)
    ctx.waitUntil(env.CACHE_KV.put(cacheKey, data.secretKey, { expirationTtl: 60 }));

    return data.secretKey;
  } catch (error) {
    console.error('Failed to fetch secret key:', error);
    return null;
  }
}

/**
 * Generate HMAC-SHA256 signature
 */
async function generateHmacSignature(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

  // Convert to URL-safe base64
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Constant-time string comparison
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Validate request origin (domain/referrer restrictions)
 */
function validateRequestOrigin(request: Request, customer: Customer): AuthResult {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // If no restrictions configured, allow all
  if (customer.allowedDomains.length === 0 && customer.allowedReferrers.length === 0) {
    return { valid: true, status: 200, message: 'OK' };
  }

  // Check allowed domains (from Origin header)
  if (customer.allowedDomains.length > 0) {
    if (!origin) {
      // No origin header - might be direct access
      // Check referer as fallback for domains
      if (!referer) {
        return {
          valid: false,
          status: 403,
          message: 'Origin or Referer header required',
        };
      }
    }

    const hostToCheck = origin ? getHostname(origin) : getHostname(referer!);

    if (hostToCheck && !isDomainAllowed(hostToCheck, customer.allowedDomains)) {
      return {
        valid: false,
        status: 403,
        message: 'Domain not authorized',
      };
    }
  }

  // Check allowed referrers
  if (customer.allowedReferrers.length > 0 && referer) {
    const refererHost = getHostname(referer);
    if (refererHost && !isDomainAllowed(refererHost, customer.allowedReferrers)) {
      return {
        valid: false,
        status: 403,
        message: 'Referrer not authorized',
      };
    }
  }

  return { valid: true, status: 200, message: 'OK' };
}

/**
 * Extract hostname from URL string
 */
function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Check if hostname matches allowed domain list
 * Supports wildcard subdomains: *.example.com
 */
function isDomainAllowed(hostname: string, allowedDomains: string[]): boolean {
  return allowedDomains.some(domain => {
    domain = domain.toLowerCase();

    // Wildcard subdomain matching
    if (domain.startsWith('*.')) {
      const baseDomain = domain.slice(2);
      return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
    }

    // Exact match
    return hostname === domain;
  });
}

/**
 * Development mock customer for testing
 */
function getMockCustomer(publicKey: string): Customer {
  return {
    id: 'mock-customer-id',
    publicKey,
    plan: {
      id: 'plan-pro',
      name: 'Pro',
      tier: 'pro',
    },
    status: 'active',
    allowedDomains: [],
    allowedReferrers: [],
    features: {
      signedUrls: false, // Disable for easier dev testing
      customDomains: true,
      avifSupport: true,
      removeWatermark: true,
      priorityProcessing: false,
    },
    limits: {
      maxRequestsPerMonth: 1000000,
      maxBandwidthPerMonth: 100 * 1024 * 1024 * 1024, // 100GB
      maxImageWidth: 4096,
      maxImageHeight: 4096,
      maxFileSize: 50 * 1024 * 1024, // 50MB
      rateLimit: 100,
    },
  };
}

/**
 * Helper: Generate signed URL (for SDK/plugin use)
 * This is exported for use in other workers or edge functions
 */
export async function generateSignedUrl(
  baseUrl: string,
  publicKey: string,
  imagePath: string,
  params: Record<string, string | number>,
  secretKey: string,
  expiryMs: number = 3600000 // 1 hour default
): Promise<string> {
  const expiry = Date.now() + expiryMs;

  // Add expiry to params
  const allParams: Record<string, string> = {
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    exp: String(expiry),
  };

  // Sort params and build string
  const sortedParams = Object.keys(allParams)
    .sort()
    .map(key => `${key}=${allParams[key]}`)
    .join('&');

  const stringToSign = `${publicKey}/${imagePath}?${sortedParams}`;
  const signature = await generateHmacSignature(stringToSign, secretKey);

  return `${baseUrl}/${publicKey}/${imagePath}?${sortedParams}&sig=${signature}`;
}
