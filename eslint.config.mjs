import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/.expo/**",
      "**/android/**",
      "**/ios/**",
      "**/*.config.js",
      "**/*.config.cjs",
      "**/*.config.mjs",
      "**/*.config.ts",
    ],
  },
  ...compat.config({
    root: true,
    ignorePatterns: [
      "**/node_modules/**",
      "**/.next/**",
      "**/android/**",
      "**/ios/**",
      "**/.expo/**",
      "**/dist/**",
      "**/build/**",
    ],
  }),
];
