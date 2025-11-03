import { FlatCompat } from "@eslint/compat";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  ...compat.config({
    name: "goguma/root",
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
