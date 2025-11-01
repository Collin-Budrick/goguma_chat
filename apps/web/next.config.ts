import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ["@goguma/ui"],
  turbopack: {
    // Force the project root so Turbopack ignores sibling lockfiles
    root: path.resolve(configDir, "..", ".."),
    resolveAlias: {
      "react-native": "react-native-web",
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "react-native": "react-native-web",
    };
    config.resolve.extensions = Array.from(
      new Set([...(config.resolve.extensions ?? []), ".web.js", ".web.ts", ".web.tsx"]),
    );
    return config;
  },
};

export default nextConfig;
