import type { RequestContext, TransformParams } from '../types';
import { parseTransformParams, validateTransformParams } from '../utils/params';
import { transformImage } from '../services/transform';
import { getCachedImage, setCachedImage, generateCacheKey } from '../services/cache';
import { trackUsage } from '../services/usage';
import { createErrorResponse, createImageResponse } from '../utils/response';
import { shouldAddWatermark } from '../utils/watermark';

export async function handleImageRequest(context: RequestContext): Promise<Response> {
  const startTime = Date.now();
  const { publicKey, imagePath, params, env, ctx, customer } = context;

  // Parse and validate transformation parameters
  const transformParams = parseTransformParams(params, env);
  const validation = validateTransformParams(transformParams, customer!);
  if (!validation.valid) {
    return createErrorResponse(400, validation.message);
  }

  // Generate cache key based on all parameters
  const cacheKey = generateCacheKey(publicKey, imagePath, transformParams);

  // Check cache first (edge cache via Cache API)
  const cachedResponse = await getCachedImage(cacheKey, context);
  if (cachedResponse) {
    // Track cache hit asynchronously
    ctx.waitUntil(
      trackUsage(context, {
        inputBytes: 0,
        outputBytes: parseInt(cachedResponse.headers.get('content-length') || '0'),
        transformParams: JSON.stringify(transformParams),
        statusCode: 200,
        responseTime: Date.now() - startTime,
        cacheStatus: 'HIT',
      })
    );
    return cachedResponse;
  }

  // Fetch original image from R2
  const r2Key = `${publicKey}/${imagePath}`;
  const originalObject = await env.IMAGES_BUCKET.get(r2Key);

  if (!originalObject) {
    return createErrorResponse(404, 'Image not found');
  }

  // Check file size limits
  if (originalObject.size > customer!.limits.maxFileSize) {
    return createErrorResponse(413, 'Image exceeds maximum file size');
  }

  const originalBuffer = await originalObject.arrayBuffer();
  const contentType = originalObject.httpMetadata?.contentType || 'image/jpeg';

  // Determine if watermark should be added
  const addWatermark = shouldAddWatermark(customer!, transformParams);
  if (addWatermark) {
    transformParams.watermark = true;
  }

  // Transform image
  let transformedBuffer: ArrayBuffer;
  let outputContentType: string;

  try {
    const result = await transformImage(originalBuffer, contentType, transformParams, context);
    transformedBuffer = result.buffer;
    outputContentType = result.contentType;
  } catch (error) {
    console.error('Transform error:', error);
    return createErrorResponse(500, 'Image transformation failed');
  }

  // Create response
  const response = createImageResponse(transformedBuffer, outputContentType, {
    cacheControl: `public, max-age=${env.CACHE_TTL_SECONDS}, immutable`,
    cacheStatus: 'MISS',
  });

  // Cache the transformed image
  ctx.waitUntil(setCachedImage(cacheKey, response.clone(), context));

  // Track usage asynchronously
  ctx.waitUntil(
    trackUsage(context, {
      inputBytes: originalObject.size,
      outputBytes: transformedBuffer.byteLength,
      transformParams: JSON.stringify(transformParams),
      statusCode: 200,
      responseTime: Date.now() - startTime,
      cacheStatus: 'MISS',
    })
  );

  return response;
}
