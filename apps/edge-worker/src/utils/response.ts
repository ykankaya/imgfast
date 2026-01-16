interface ResponseOptions {
  cacheControl?: string;
  cacheStatus?: 'HIT' | 'MISS' | 'BYPASS';
  additionalHeaders?: Record<string, string>;
}

interface ErrorDetails {
  documentation?: string;
  example?: string;
  upgrade_url?: string;
  current_usage?: Record<string, number>;
  [key: string]: unknown;
}

/**
 * Create a standardized error response.
 */
export function createErrorResponse(
  status: number,
  message: string,
  headers?: Record<string, string>,
  details?: ErrorDetails
): Response {
  const responseHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-ImageCDN-Error': 'true',
    ...headers,
  });

  const body: Record<string, unknown> = {
    error: true,
    status,
    message,
  };

  if (details) {
    body.details = details;
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders,
  });
}

/**
 * Create a JSON response.
 */
export function createJsonResponse(
  data: unknown,
  status: number = 200,
  headers?: Record<string, string>
): Response {
  const responseHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...headers,
  });

  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

/**
 * Create a successful image response with proper headers.
 */
export function createImageResponse(
  body: ArrayBuffer,
  contentType: string,
  options: ResponseOptions = {}
): Response {
  const headers = new Headers({
    'Content-Type': contentType,
    'Content-Length': String(body.byteLength),
    'Cache-Control': options.cacheControl || 'public, max-age=31536000, immutable',
    'X-Cache': options.cacheStatus || 'MISS',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    Vary: 'Accept',
    ...options.additionalHeaders,
  });

  // Add version header
  headers.set('X-ImageCDN-Version', '1.0.0');

  return new Response(body, {
    status: 200,
    headers,
  });
}

/**
 * Create a redirect response.
 */
export function createRedirectResponse(url: string, permanent = false): Response {
  return new Response(null, {
    status: permanent ? 301 : 302,
    headers: {
      Location: url,
      'Cache-Control': permanent ? 'public, max-age=31536000' : 'no-cache',
    },
  });
}

/**
 * Create a 304 Not Modified response.
 */
export function createNotModifiedResponse(): Response {
  return new Response(null, {
    status: 304,
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

/**
 * Add CORS headers to a response.
 */
export function addCorsHeaders(response: Response, origin?: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin || '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Expose-Headers', 'X-Cache, X-RateLimit-Limit, X-RateLimit-Remaining');

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

/**
 * Create a streaming response for large images.
 */
export function createStreamingResponse(
  stream: ReadableStream,
  contentType: string,
  contentLength?: number,
  options: ResponseOptions = {}
): Response {
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': options.cacheControl || 'public, max-age=31536000, immutable',
    'X-Cache': options.cacheStatus || 'MISS',
    'X-Content-Type-Options': 'nosniff',
    'Transfer-Encoding': 'chunked',
    Vary: 'Accept',
    ...options.additionalHeaders,
  });

  if (contentLength !== undefined) {
    headers.set('Content-Length', String(contentLength));
  }

  headers.set('X-ImageCDN-Version', '1.0.0');

  return new Response(stream, {
    status: 200,
    headers,
  });
}
