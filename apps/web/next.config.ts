import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@goguma/ui"],
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
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

export default withNextIntl(nextConfig);
