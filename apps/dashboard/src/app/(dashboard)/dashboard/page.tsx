'use client';

import { BarChart3, Image, Zap, Globe } from 'lucide-react';

const stats = [
  { name: 'Total Requests', value: '45,230', change: '+12%', icon: BarChart3 },
  { name: 'Bandwidth Used', value: '12.5 GB', change: '+8%', icon: Globe },
  { name: 'Images Stored', value: '1,234', change: '+23', icon: Image },
  { name: 'Cache Hit Rate', value: '87%', change: '+2%', icon: Zap },
];

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map(stat => (
          <div key={stat.name} className="card">
            <div className="flex items-center justify-between">
              <stat.icon className="w-8 h-8 text-primary-500" />
              <span className="text-sm text-green-600 font-medium">{stat.change}</span>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-500">{stat.name}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Start */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold mb-4">Quick Start</h2>
        <div className="bg-gray-900 rounded-lg p-4 text-sm">
          <p className="text-gray-400 mb-2"># Your CDN URL format:</p>
          <code className="text-green-400">
            https://cdn.imagecdn.io/YOUR_PUBLIC_KEY/path/to/image.jpg?w=800&q=80&f=webp
          </code>
        </div>
        <div className="mt-4 flex space-x-4">
          <button className="btn-primary">Get API Keys</button>
          <button className="btn-secondary">View Documentation</button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recent Transformations</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-3">Image</th>
                <th className="pb-3">Transformation</th>
                <th className="pb-3">Size</th>
                <th className="pb-3">Cache</th>
                <th className="pb-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                { path: '/products/hero.jpg', params: 'w=1200,q=80,f=webp', size: '45 KB', cache: 'HIT', time: '2m ago' },
                { path: '/blog/post-1.png', params: 'w=800,q=85,f=avif', size: '32 KB', cache: 'MISS', time: '5m ago' },
                { path: '/avatars/user-123.jpg', params: 'w=200,h=200,fit=cover', size: '8 KB', cache: 'HIT', time: '12m ago' },
              ].map((item, i) => (
                <tr key={i} className="text-gray-700">
                  <td className="py-3 font-mono text-xs">{item.path}</td>
                  <td className="py-3 text-gray-500">{item.params}</td>
                  <td className="py-3">{item.size}</td>
                  <td className="py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        item.cache === 'HIT'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {item.cache}
                    </span>
                  </td>
                  <td className="py-3 text-gray-500">{item.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
