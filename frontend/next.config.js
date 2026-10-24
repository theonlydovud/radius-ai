/** @type {import('next').NextConfig} */

// Адрес backend на Render, например https://radius-ai-backend.onrender.com
const BACKEND_URL = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000").replace(/\/+$/, "");

const nextConfig = {
  async rewrites() {
    // Все запросы дашборда к /api/* Vercel проксирует на backend — страницы
    // продолжают вызывать fetch("/api/..."), CORS не нужен.
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
};

module.exports = nextConfig;
