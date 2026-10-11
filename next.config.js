/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Запуск MTProto-слушателей при старте сервера (src/instrumentation.ts).
    instrumentationHook: true,
    // GramJS не должен бандлиться webpack'ом.
    serverComponentsExternalPackages: ['telegram'],
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async rewrites() {
    return [
      { source: '/ping', destination: '/api/health' },
      { source: '/health', destination: '/api/health' },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
};

module.exports = nextConfig;
