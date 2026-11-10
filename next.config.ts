import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  output: "standalone",
  // /disparos foi unificado em /campanhas (aba "Envios em massa").
  async redirects() {
    return [{ source: "/disparos", destination: "/campanhas?aba=envios", statusCode: 301 }];
  },
  /* config options here */
  experimental: {
    agentFeedback: true,
    agentUpgrade: "security",
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
