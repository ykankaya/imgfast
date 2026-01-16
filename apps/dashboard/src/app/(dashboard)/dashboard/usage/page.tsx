'use client';

import { useState } from 'react';

export default function UsagePage() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const usageData = {
    requests: { used: 45230, limit: 100000 },
    bandwidth: { used: 12.5, limit: 50, unit: 'GB' },
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Usage</h1>
        <div className="flex space-x-2">
          {(['7d', '30d', '90d'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-lg text-sm ${
                period === p
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Quota Usage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Requests</h3>
          <div className="flex items-end justify-between mb-2">
            <span className="text-3xl font-bold">
              {usageData.requests.used.toLocaleString()}
            </span>
            <span className="text-sm text-gray-500">
              / {usageData.requests.limit.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary-500 h-2 rounded-full"
              style={{
                width: `${(usageData.requests.used / usageData.requests.limit) * 100}%`,
              }}
            />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {((usageData.requests.used / usageData.requests.limit) * 100).toFixed(1)}% of monthly
            quota
          </p>
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Bandwidth</h3>
          <div className="flex items-end justify-between mb-2">
            <span className="text-3xl font-bold">{usageData.bandwidth.used}</span>
            <span className="text-sm text-gray-500">
              / {usageData.bandwidth.limit} {usageData.bandwidth.unit}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary-500 h-2 rounded-full"
              style={{
                width: `${(usageData.bandwidth.used / usageData.bandwidth.limit) * 100}%`,
              }}
            />
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {((usageData.bandwidth.used / usageData.bandwidth.limit) * 100).toFixed(1)}% of monthly
            quota
          </p>
        </div>
      </div>

      {/* Usage Chart Placeholder */}
      <div className="card mb-8">
        <h3 className="text-lg font-semibold mb-4">Request History</h3>
        <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
          <p className="text-gray-500">Usage chart will be displayed here</p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">By Format</h3>
          <div className="space-y-3">
            {[
              { format: 'WebP', count: 25000, percent: 55 },
              { format: 'JPEG', count: 15000, percent: 33 },
              { format: 'AVIF', count: 5000, percent: 11 },
              { format: 'PNG', count: 230, percent: 1 },
            ].map(item => (
              <div key={item.format}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{item.format}</span>
                  <span className="text-gray-500">{item.count.toLocaleString()}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-primary-500 h-1.5 rounded-full"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">By Edge Location</h3>
          <div className="space-y-3">
            {[
              { location: 'IAD (US East)', requests: 15000 },
              { location: 'SFO (US West)', requests: 12000 },
              { location: 'LHR (Europe)', requests: 8000 },
              { location: 'NRT (Asia)', requests: 5000 },
              { location: 'SYD (Australia)', requests: 3000 },
            ].map(item => (
              <div key={item.location} className="flex justify-between text-sm">
                <span>{item.location}</span>
                <span className="text-gray-500">{item.requests.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
