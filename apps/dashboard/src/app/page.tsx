import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-2xl font-bold text-primary-600">ImageCDN</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/login" className="text-gray-600 hover:text-gray-900">
                Login
              </Link>
              <Link href="/signup" className="btn-primary">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">
              Fast, Global Image Delivery
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Optimize, transform, and deliver images at the edge.
              WebP/AVIF conversion, smart caching, and global CDN in one platform.
            </p>
            <div className="flex justify-center space-x-4">
              <Link href="/signup" className="btn-primary text-lg px-8 py-3">
                Start Free Trial
              </Link>
              <Link href="/docs" className="btn-secondary text-lg px-8 py-3">
                Documentation
              </Link>
            </div>
          </div>

          {/* Features */}
          <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="card text-center">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-semibold mb-2">Edge-First</h3>
              <p className="text-gray-600">
                Transform images at 300+ edge locations worldwide for minimal latency.
              </p>
            </div>
            <div className="card text-center">
              <div className="text-4xl mb-4">🖼️</div>
              <h3 className="text-xl font-semibold mb-2">Auto Optimization</h3>
              <p className="text-gray-600">
                Automatic WebP/AVIF conversion based on browser support.
              </p>
            </div>
            <div className="card text-center">
              <div className="text-4xl mb-4">🔌</div>
              <h3 className="text-xl font-semibold mb-2">Easy Integration</h3>
              <p className="text-gray-600">
                WordPress, Shopify, and React SDKs for seamless integration.
              </p>
            </div>
          </div>

          {/* Pricing Preview */}
          <div className="mt-24">
            <h2 className="text-3xl font-bold text-center mb-12">Simple Pricing</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                { name: 'Free', price: '$0', requests: '10K', bandwidth: '1 GB' },
                { name: 'Starter', price: '$19', requests: '100K', bandwidth: '10 GB' },
                { name: 'Pro', price: '$49', requests: '500K', bandwidth: '50 GB', popular: true },
                { name: 'Enterprise', price: '$199', requests: '5M', bandwidth: '500 GB' },
              ].map(plan => (
                <div
                  key={plan.name}
                  className={`card ${plan.popular ? 'ring-2 ring-primary-500' : ''}`}
                >
                  {plan.popular && (
                    <span className="text-xs font-semibold text-primary-600 uppercase">
                      Most Popular
                    </span>
                  )}
                  <h3 className="text-xl font-bold mt-2">{plan.name}</h3>
                  <div className="text-3xl font-bold my-4">
                    {plan.price}
                    <span className="text-sm text-gray-500">/mo</span>
                  </div>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>{plan.requests} requests/mo</li>
                    <li>{plan.bandwidth} bandwidth</li>
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-600">
          <p>&copy; 2024 ImageCDN. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
