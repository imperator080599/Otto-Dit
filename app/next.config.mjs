/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'exceljs', 'unpdf'],
  experimental: {
    serverActions: { bodySizeLimit: '20mb' },
  },
};

export default nextConfig;
