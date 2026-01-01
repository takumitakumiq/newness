/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // API proxy for development
  async rewrites() {
    return [
      // トレイリングスラッシュありのパスを先に処理
      {
        source: '/api/:path*/',
        destination: 'http://localhost:8005/api/:path*/',
      },
      {
        source: '/api/:path*',
        destination: 'http://localhost:8005/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
