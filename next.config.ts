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
    // Anexos de até 10 MB no teste da IA (/ia): o middleware limitaria o corpo a 10 MB no total.
    proxyClientMaxBodySize: "25mb",
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
