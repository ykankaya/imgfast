/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  transpilePackages: ['@imgfast/shared-types'],
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.imgfast.io',
      },
    ],
  },
  trailingSlash: true,
};

module.exports = nextConfig;
