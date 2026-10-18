/** @type {import('next').NextConfig} */
const apiPort = process.env.RFS_API_PORT ?? '4000';
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@rfs/shared'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `http://127.0.0.1:${apiPort}/api/v1/:path*`,
      },
      {
        source: '/health',
        destination: `http://127.0.0.1:${apiPort}/health`,
      },
    ];
  },
};

export default nextConfig;
