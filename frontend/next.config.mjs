/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@rfs/shared'],
  // Rewrites moved to middleware.ts; API port is read at request time.
};

export default nextConfig;