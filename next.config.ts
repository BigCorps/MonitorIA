import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "www.monitoria.cam",
          },
        ],
        destination: "https://monitoria.cam/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
