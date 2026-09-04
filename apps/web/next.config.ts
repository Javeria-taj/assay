import type { NextConfig } from "next";

/**
 * @assay/contract ships TypeScript source rather than a build, and its internal
 * re-exports use TypeScript's `./money.js` convention — a specifier that points
 * at `money.ts` on disk. Next has to be told that, once per bundler, or the
 * package resolves to an empty module.
 */
const nextConfig: NextConfig = {
  transpilePackages: ["@assay/contract"],

  turbopack: {
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },

  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
