import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/counselor', destination: '/learner', permanent: true },
    ]
  },
};

export default nextConfig;
