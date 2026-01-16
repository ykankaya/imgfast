import { Injectable, Logger } from '@nestjs/common';

/**
 * Usage record from edge worker
 */
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

export interface UsageSummary {
  period: string;
  requests: number;
  bandwidth: number;
  cacheHitRate: number;
  transformations: number;
}

export interface UsageDetails {
  hourly: { hour: string; requests: number; bandwidth: number }[];
  daily: { date: string; requests: number; bandwidth: number }[];
  byFormat: { format: string; count: number }[];
  byEdgeLocation: { location: string; requests: number }[];
}

export interface MonthlyUsage {
  requests: number;
  bandwidth: number;
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  // In-memory storage for development
  // In production, use PostgreSQL/TimescaleDB or ClickHouse
  private usageRecords: UsageRecord[] = [];
  private monthlyAggregates: Map<string, MonthlyUsage> = new Map();

  /**
   * Record a batch of usage records from edge worker
   */
  async recordBatch(records: UsageRecord[]): Promise<void> {
    const currentPeriod = this.getCurrentPeriod();

    for (const record of records) {
      try {
        // Store individual record
        this.usageRecords.push(record);

        // Update monthly aggregates
        const key = `${record.customerId}:${currentPeriod}`;
        const current = this.monthlyAggregates.get(key) || { requests: 0, bandwidth: 0 };

        this.monthlyAggregates.set(key, {
          requests: current.requests + 1,
          bandwidth: current.bandwidth + record.outputBytes,
        });
      } catch (error) {
        this.logger.error(`Failed to record usage: ${error}`);
      }
    }

    this.logger.debug(`Recorded ${records.length} usage records`);
  }

  /**
   * Record a single usage event
   */
  async record(record: UsageRecord): Promise<void> {
    await this.recordBatch([record]);
  }

  /**
   * Get current month's usage for a customer
   */
  async getCurrentMonthUsage(customerId: string): Promise<MonthlyUsage> {
    const currentPeriod = this.getCurrentPeriod();
    const key = `${customerId}:${currentPeriod}`;

    return this.monthlyAggregates.get(key) || { requests: 0, bandwidth: 0 };
  }

  /**
   * Get usage summary for current billing period.
   */
  async getCurrentUsage(customerId: string): Promise<UsageSummary> {
    const monthlyUsage = await this.getCurrentMonthUsage(customerId);

    // Calculate cache hit rate from recent records
    const recentRecords = this.usageRecords.filter(
      r => r.customerId === customerId && r.timestamp > Date.now() - 24 * 60 * 60 * 1000
    );

    const cacheHits = recentRecords.filter(r => r.cacheStatus === 'HIT').length;
    const cacheHitRate = recentRecords.length > 0 ? cacheHits / recentRecords.length : 0;

    const transformations = recentRecords.filter(r => r.requestType === 'transform').length;

    return {
      period: this.getCurrentPeriod(),
      requests: monthlyUsage.requests,
      bandwidth: monthlyUsage.bandwidth,
      cacheHitRate,
      transformations,
    };
  }

  /**
   * Get detailed usage breakdown.
   */
  async getUsageDetails(customerId: string, startDate: Date, endDate: Date): Promise<UsageDetails> {
    const startTs = startDate.getTime();
    const endTs = endDate.getTime();

    // Filter records for this customer and time range
    const records = this.usageRecords.filter(
      r => r.customerId === customerId && r.timestamp >= startTs && r.timestamp <= endTs
    );

    // Group by hour
    const hourlyMap = new Map<string, { requests: number; bandwidth: number }>();
    const dailyMap = new Map<string, { requests: number; bandwidth: number }>();
    const formatMap = new Map<string, number>();
    const locationMap = new Map<string, number>();

    for (const record of records) {
      const date = new Date(record.timestamp);
      const hour = `${String(date.getUTCHours()).padStart(2, '0')}:00`;
      const day = date.toISOString().split('T')[0];

      // Hourly
      const hourly = hourlyMap.get(hour) || { requests: 0, bandwidth: 0 };
      hourlyMap.set(hour, {
        requests: hourly.requests + 1,
        bandwidth: hourly.bandwidth + record.outputBytes,
      });

      // Daily
      const daily = dailyMap.get(day) || { requests: 0, bandwidth: 0 };
      dailyMap.set(day, {
        requests: daily.requests + 1,
        bandwidth: daily.bandwidth + record.outputBytes,
      });

      // Format
      const format = this.extractFormat(record.transformParams);
      if (format) {
        formatMap.set(format, (formatMap.get(format) || 0) + 1);
      }

      // Location
      locationMap.set(record.edgeLocation, (locationMap.get(record.edgeLocation) || 0) + 1);
    }

    return {
      hourly: Array.from(hourlyMap.entries()).map(([hour, data]) => ({ hour, ...data })),
      daily: Array.from(dailyMap.entries()).map(([date, data]) => ({ date, ...data })),
      byFormat: Array.from(formatMap.entries()).map(([format, count]) => ({ format, count })),
      byEdgeLocation: Array.from(locationMap.entries()).map(([location, requests]) => ({
        location,
        requests,
      })),
    };
  }

  /**
   * Get usage history for past months.
   */
  async getUsageHistory(customerId: string, months: number = 6): Promise<UsageSummary[]> {
    const history: UsageSummary[] = [];
    const now = new Date();

    for (let i = 0; i < months; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const key = `${customerId}:${period}`;

      const usage = this.monthlyAggregates.get(key) || { requests: 0, bandwidth: 0 };

      history.push({
        period,
        requests: usage.requests,
        bandwidth: usage.bandwidth,
        cacheHitRate: 0.85, // Would calculate from historical data
        transformations: Math.floor(usage.requests * 0.8), // Estimate
      });
    }

    return history;
  }

  /**
   * Check if customer is approaching or over quota.
   */
  async checkQuota(
    customerId: string,
    limits: { requests: number; bandwidth: number }
  ): Promise<{
    requestsUsed: number;
    bandwidthUsed: number;
    requestsPercent: number;
    bandwidthPercent: number;
    isOverLimit: boolean;
    warningLevel: 'none' | 'approaching' | 'exceeded';
  }> {
    const usage = await this.getCurrentMonthUsage(customerId);

    const requestsPercent = (usage.requests / limits.requests) * 100;
    const bandwidthPercent = (usage.bandwidth / limits.bandwidth) * 100;

    let warningLevel: 'none' | 'approaching' | 'exceeded' = 'none';
    if (requestsPercent >= 100 || bandwidthPercent >= 100) {
      warningLevel = 'exceeded';
    } else if (requestsPercent >= 80 || bandwidthPercent >= 80) {
      warningLevel = 'approaching';
    }

    return {
      requestsUsed: usage.requests,
      bandwidthUsed: usage.bandwidth,
      requestsPercent,
      bandwidthPercent,
      isOverLimit: warningLevel === 'exceeded',
      warningLevel,
    };
  }

  /**
   * Get real-time stats for dashboard
   */
  async getRealtimeStats(customerId: string): Promise<{
    requestsPerSecond: number;
    bandwidthPerSecond: number;
    activeConnections: number;
    cacheHitRateRealtime: number;
  }> {
    // Calculate stats from last 10 seconds of records
    const tenSecondsAgo = Date.now() - 10000;
    const recentRecords = this.usageRecords.filter(
      r => r.customerId === customerId && r.timestamp >= tenSecondsAgo
    );

    const requestsPerSecond = recentRecords.length / 10;
    const bandwidthPerSecond = recentRecords.reduce((sum, r) => sum + r.outputBytes, 0) / 10;
    const cacheHits = recentRecords.filter(r => r.cacheStatus === 'HIT').length;

    return {
      requestsPerSecond,
      bandwidthPerSecond,
      activeConnections: Math.floor(requestsPerSecond * 0.5), // Estimate
      cacheHitRateRealtime: recentRecords.length > 0 ? cacheHits / recentRecords.length : 0,
    };
  }

  /**
   * Clean up old records (called periodically)
   */
  async cleanupOldRecords(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    const before = this.usageRecords.length;

    this.usageRecords = this.usageRecords.filter(r => r.timestamp >= cutoff);

    const removed = before - this.usageRecords.length;
    this.logger.debug(`Cleaned up ${removed} old usage records`);

    return removed;
  }

  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private extractFormat(transformParams: string): string | null {
    if (!transformParams) return null;

    const match = transformParams.match(/f=(\w+)/);
    return match ? match[1] : null;
  }
}
