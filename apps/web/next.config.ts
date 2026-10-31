import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: false,
  async redirects() {
    return [
      { source: '/sitemap-0.xml', destination: '/sitemap.xml', permanent: true },
      {
        source: '/congressmen',
        destination: '/congress-members',
        permanent: true,
      },
      {
        source: '/congressmen/:id',
        destination: '/congress-members/:id',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
