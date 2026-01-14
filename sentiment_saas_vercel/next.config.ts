import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      process.env.NODE_ENV === 'development'
        ? {
          source: '/api/:path*',
          destination: 'http://127.0.0.1:8000/api/:path*', // Proxy to Backend
        }
        : {
          source: '/api/:path*',
          destination: '/api/:path*', // Let Vercel handle it
        },
    ]
  },
};

export default nextConfig;
