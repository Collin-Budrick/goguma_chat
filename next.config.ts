import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    // Force the project root so Turbopack ignores sibling lockfiles
    root: configDir,
  },
};

export default nextConfig;
