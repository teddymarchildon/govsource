import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: false,
  async redirects() {
    return [
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
