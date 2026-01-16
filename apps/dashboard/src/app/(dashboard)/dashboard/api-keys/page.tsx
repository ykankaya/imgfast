'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  publicKey: string;
  secretKeyPreview: string;
  createdAt: string;
  lastUsed: string | null;
}

export default function ApiKeysPage() {
  const [showSecret, setShowSecret] = useState<string | null>(null);
  const [keys] = useState<ApiKey[]>([
    {
      id: '1',
      name: 'Production',
      publicKey: 'imgfast_pk_abc123xyz789',
      secretKeyPreview: 'imgfast_sk_****************************',
      createdAt: '2024-01-15',
      lastUsed: '2 hours ago',
    },
    {
      id: '2',
      name: 'Development',
      publicKey: 'imgfast_pk_dev456test',
      secretKeyPreview: 'imgfast_sk_****************************',
      createdAt: '2024-01-10',
      lastUsed: '5 days ago',
    },
  ]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
        <button className="btn-primary flex items-center">
          <Plus className="w-4 h-4 mr-2" />
          Generate New Key
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
        <h3 className="font-medium text-blue-800 mb-2">How API Keys Work</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>
            <strong>Public Key:</strong> Used in CDN URLs (safe to expose in frontend code)
          </li>
          <li>
            <strong>Secret Key:</strong> Used for API authentication (keep secure, never expose)
          </li>
        </ul>
      </div>

      {/* Keys List */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500 border-b">
                <th className="pb-3 font-medium">Name</th>
                <th className="pb-3 font-medium">Public Key</th>
                <th className="pb-3 font-medium">Secret Key</th>
                <th className="pb-3 font-medium">Created</th>
                <th className="pb-3 font-medium">Last Used</th>
                <th className="pb-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {keys.map(key => (
                <tr key={key.id}>
                  <td className="py-4">
                    <span className="font-medium">{key.name}</span>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center space-x-2">
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {key.publicKey}
                      </code>
                      <button
                        onClick={() => copyToClipboard(key.publicKey)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center space-x-2">
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {showSecret === key.id ? 'imgfast_sk_realkey...' : key.secretKeyPreview}
                      </code>
                      <button
                        onClick={() => setShowSecret(showSecret === key.id ? null : key.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {showSecret === key.id ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="py-4 text-sm text-gray-500">{key.createdAt}</td>
                  <td className="py-4 text-sm text-gray-500">{key.lastUsed || 'Never'}</td>
                  <td className="py-4">
                    <button className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Usage Example */}
      <div className="card mt-8">
        <h3 className="text-lg font-semibold mb-4">Usage Example</h3>
        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-gray-300">
            <code>{`<!-- Basic usage in HTML -->
<img src="https://cdn.imagecdn.io/YOUR_PUBLIC_KEY/images/hero.jpg?w=800&q=80" />

<!-- With automatic format conversion -->
<img src="https://cdn.imagecdn.io/YOUR_PUBLIC_KEY/images/hero.jpg?w=800&q=80&f=auto" />

<!-- API request with secret key -->
curl -X POST https://api.imagecdn.io/v1/images/upload-url \\
  -H "X-API-Key: YOUR_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"filename": "hero.jpg", "contentType": "image/jpeg"}'`}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
