import type { RequestContext, TransformParams } from '../types';

/**
 * Generate a unique cache key based on all transformation parameters.
 * Key format: imagecdn:{publicKey}:{imagePath}:{paramsHash}
 */
export function generateCacheKey(
  publicKey: string,
  imagePath: string,
  params: TransformParams
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key as keyof TransformParams]}`)
    .join('&');

  // Simple hash for cache key
  const paramsHash = simpleHash(sortedParams);

  return `imagecdn:${publicKey}:${imagePath}:${paramsHash}`;
}

/**
 * Get cached image from Cloudflare Cache API.
 */
export async function getCachedImage(
  cacheKey: string,
  context: RequestContext
): Promise<Response | null> {
  const cache = caches.default;
  const cacheUrl = new URL(context.request.url);
  cacheUrl.pathname = `/__cache/${cacheKey}`;

  try {
    const cachedResponse = await cache.match(cacheUrl.toString());
    if (cachedResponse) {
      // Clone and add cache hit header
      const headers = new Headers(cachedResponse.headers);
      headers.set('X-Cache', 'HIT');
      headers.set('X-Cache-Key', cacheKey);

      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        headers,
      });
    }
  } catch (error) {
    console.error('Cache read error:', error);
  }

  return null;
}

/**
 * Store transformed image in Cloudflare Cache API.
 */
export async function setCachedImage(
  cacheKey: string,
  response: Response,
  context: RequestContext
): Promise<void> {
  const cache = caches.default;
  const cacheUrl = new URL(context.request.url);
  cacheUrl.pathname = `/__cache/${cacheKey}`;

  try {
    // Ensure response has proper cache headers
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', `public, max-age=${context.env.CACHE_TTL_SECONDS}, immutable`);
    headers.set('X-Cache-Key', cacheKey);

    const cacheResponse = new Response(response.body, {
      status: response.status,
      headers,
    });

    await cache.put(cacheUrl.toString(), cacheResponse);
  } catch (error) {
    console.error('Cache write error:', error);
  }
}

/**
 * Invalidate cached image(s).
 * Called when customer uploads new version or deletes image.
 */
export async function invalidateCache(
  publicKey: string,
  imagePath: string,
  context: RequestContext
): Promise<void> {
  // For full cache invalidation, we'd need to track all variants
  // or use a cache tag system. For now, this is a placeholder.
  const cache = caches.default;
  const cacheUrl = new URL(context.request.url);

  // In production, you'd iterate through known variants or use
  // Cloudflare's Cache Tags feature (Enterprise only)
  cacheUrl.pathname = `/__cache/imagecdn:${publicKey}:${imagePath}:*`;

  try {
    // This won't work with wildcards - need proper implementation
    // await cache.delete(cacheUrl.toString());
    console.log(`Cache invalidation requested for ${publicKey}/${imagePath}`);
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}

/**
 * Simple string hash function for cache keys.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}
