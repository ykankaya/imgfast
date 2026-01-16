-- ImageCDN D1 Database Schema
-- Run with: wrangler d1 execute imagecdn-usage --file=./migrations/0001_initial.sql

-- Usage records table
CREATE TABLE IF NOT EXISTS usage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('transform', 'cache_hit', 'origin')),
  input_bytes INTEGER NOT NULL DEFAULT 0,
  output_bytes INTEGER NOT NULL DEFAULT 0,
  transform_params TEXT,
  status_code INTEGER NOT NULL,
  response_time INTEGER NOT NULL,
  cache_status TEXT NOT NULL CHECK (cache_status IN ('HIT', 'MISS', 'BYPASS')),
  edge_location TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_usage_customer_timestamp
ON usage_records(customer_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_usage_public_key_timestamp
ON usage_records(public_key, timestamp);

CREATE INDEX IF NOT EXISTS idx_usage_timestamp
ON usage_records(timestamp);

-- Daily aggregates table (for faster dashboard queries)
CREATE TABLE IF NOT EXISTS usage_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  date TEXT NOT NULL, -- YYYY-MM-DD format
  total_requests INTEGER NOT NULL DEFAULT 0,
  cache_hits INTEGER NOT NULL DEFAULT 0,
  cache_misses INTEGER NOT NULL DEFAULT 0,
  total_input_bytes INTEGER NOT NULL DEFAULT 0,
  total_output_bytes INTEGER NOT NULL DEFAULT 0,
  avg_response_time INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_daily_customer_date
ON usage_daily(customer_id, date);

-- Monthly aggregates table
CREATE TABLE IF NOT EXISTS usage_monthly (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  month TEXT NOT NULL, -- YYYY-MM format
  total_requests INTEGER NOT NULL DEFAULT 0,
  total_bandwidth INTEGER NOT NULL DEFAULT 0,
  cache_hit_rate REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, month)
);

CREATE INDEX IF NOT EXISTS idx_usage_monthly_customer
ON usage_monthly(customer_id, month);
