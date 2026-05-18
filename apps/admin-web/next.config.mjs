/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { allowedOrigins: ['*'] } },
  transpilePackages: ['@aicc2/shared', '@aicc2/db'],
};
export default nextConfig;
