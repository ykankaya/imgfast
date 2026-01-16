'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';

export default function SettingsPage() {
  const [domains, setDomains] = useState(['example.com', '*.mysite.com']);
  const [newDomain, setNewDomain] = useState('');

  const addDomain = () => {
    if (newDomain && !domains.includes(newDomain)) {
      setDomains([...domains, newDomain]);
      setNewDomain('');
    }
  };

  const removeDomain = (domain: string) => {
    setDomains(domains.filter(d => d !== domain));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Settings</h1>

      {/* Domain Restrictions */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold mb-4">Allowed Domains</h2>
        <p className="text-sm text-gray-500 mb-4">
          Restrict image access to specific domains. Leave empty to allow all domains.
          Supports wildcards (e.g., *.example.com).
        </p>

        <div className="flex space-x-2 mb-4">
          <input
            type="text"
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            placeholder="example.com or *.example.com"
            className="input flex-1"
          />
          <button onClick={addDomain} className="btn-primary flex items-center">
            <Plus className="w-4 h-4 mr-1" />
            Add
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {domains.map(domain => (
            <span
              key={domain}
              className="inline-flex items-center bg-gray-100 px-3 py-1 rounded-full text-sm"
            >
              {domain}
              <button
                onClick={() => removeDomain(domain)}
                className="ml-2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </span>
          ))}
          {domains.length === 0 && (
            <span className="text-sm text-gray-500">All domains allowed</span>
          )}
        </div>
      </div>

      {/* Transformation Defaults */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold mb-4">Default Transformation Settings</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Quality
            </label>
            <input type="number" defaultValue={80} min={1} max={100} className="input" />
            <p className="text-xs text-gray-500 mt-1">1-100, lower = smaller file size</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Format
            </label>
            <select className="input" defaultValue="auto">
              <option value="auto">Auto (WebP/AVIF based on browser)</option>
              <option value="webp">WebP</option>
              <option value="avif">AVIF</option>
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Width (px)
            </label>
            <input type="number" defaultValue={4096} className="input" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Height (px)
            </label>
            <input type="number" defaultValue={4096} className="input" />
          </div>
        </div>

        <button className="btn-primary mt-6">Save Settings</button>
      </div>

      {/* Cache Settings */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold mb-4">Cache Settings</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cache TTL (seconds)
          </label>
          <input type="number" defaultValue={31536000} className="input max-w-xs" />
          <p className="text-xs text-gray-500 mt-1">
            Default: 31536000 (1 year). Transformed images are immutable.
          </p>
        </div>

        <button className="btn-secondary mt-6">Purge All Cache</button>
      </div>

      {/* Danger Zone */}
      <div className="card border-red-200">
        <h2 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Regenerate API Keys</h3>
              <p className="text-sm text-gray-500">
                This will invalidate all existing API keys
              </p>
            </div>
            <button className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50">
              Regenerate
            </button>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div>
              <h3 className="font-medium">Delete Account</h3>
              <p className="text-sm text-gray-500">
                Permanently delete your account and all data
              </p>
            </div>
            <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
