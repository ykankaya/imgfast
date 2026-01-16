import type { Env } from '../types';

export function handleHealthCheck(env: Env): Response {
  return new Response(
    JSON.stringify({
      status: 'healthy',
      environment: env.ENVIRONMENT,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
}
