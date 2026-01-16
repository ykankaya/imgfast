import type { RequestContext, UsageRecord } from '../types';

interface UsageData {
  inputBytes: number;
  outputBytes: number;
  transformParams: string;
  statusCode: number;
  responseTime: number;
  cacheStatus: 'HIT' | 'MISS' | 'BYPASS';
}

/**
 * Track usage asynchronously - never blocks image delivery.
 * Uses D1 for durable storage and KV for fast aggregates.
 */
export async function trackUsage(context: RequestContext, data: UsageData): Promise<void> {
  const { publicKey, env, customer, request } = context;

  if (!customer) return;

  const record: UsageRecord = {
    customerId: customer.id,
    publicKey,
    timestamp: Date.now(),
    requestType: data.cacheStatus === 'HIT' ? 'cache_hit' : 'transform',
    inputBytes: data.inputBytes,
    outputBytes: data.outputBytes,
    transformParams: data.transformParams,
    statusCode: data.statusCode,
    responseTime: data.responseTime,
    cacheStatus: data.cacheStatus,
    edgeLocation: request.cf?.colo as string || 'unknown',
  };

  // Batch writes to avoid overwhelming D1
  await Promise.allSettled([
    writeToD1(env.USAGE_DB, record),
    updateKVAggregates(env.CACHE_KV, record),
  ]);
}

/**
 * Write individual usage record to D1.
 */
async function writeToD1(db: D1Database, record: UsageRecord): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO usage_records
         (customer_id, public_key, timestamp, request_type, input_bytes, output_bytes,
          transform_params, status_code, response_time, cache_status, edge_location)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        record.customerId,
        record.publicKey,
        record.timestamp,
        record.requestType,
        record.inputBytes,
        record.outputBytes,
        record.transformParams,
        record.statusCode,
        record.responseTime,
        record.cacheStatus,
        record.edgeLocation
      )
      .run();
  } catch (error) {
    console.error('D1 write error:', error);
  }
}

/**
 * Update KV aggregates for fast quota checks.
 * Increments monthly request count and bandwidth.
 */
async function updateKVAggregates(kv: KVNamespace, record: UsageRecord): Promise<void> {
  const monthKey = getMonthKey();
  const quotaKey = `quota:${record.publicKey}:${monthKey}`;

  try {
    // Get current aggregates
    const current = await kv.get<{ requests: number; bandwidth: number }>(quotaKey, 'json');

    const updated = {
      requests: (current?.requests || 0) + 1,
      bandwidth: (current?.bandwidth || 0) + record.outputBytes,
    };

    // Store with expiration at end of next month (safety margin)
    await kv.put(quotaKey, JSON.stringify(updated), {
      expirationTtl: 60 * 60 * 24 * 62, // ~2 months
    });
  } catch (error) {
    console.error('KV aggregate update error:', error);
  }
}

/**
 * Get current month key in YYYY-MM format.
 */
function getMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * D1 schema for usage_records table.
 * Run this as a migration when setting up D1.
 */
export const USAGE_SCHEMA = `
CREATE TABLE IF NOT EXISTS usage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  request_type TEXT NOT NULL,
  input_bytes INTEGER NOT NULL,
  output_bytes INTEGER NOT NULL,
  transform_params TEXT,
  status_code INTEGER NOT NULL,
  response_time INTEGER NOT NULL,
  cache_status TEXT NOT NULL,
  edge_location TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usage_customer_timestamp
ON usage_records(customer_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_usage_public_key_timestamp
ON usage_records(public_key, timestamp);
`;
