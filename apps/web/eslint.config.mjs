import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const compat = new FlatCompat({
	baseDirectory: __dirname,
});

const baseConfig = require("@goguma/config/eslint/react");

export default [
	{
		ignores: [
			"**/.next/**",
			"**/node_modules/**",
			"**/*.config.js",
			"**/*.config.cjs",
			"**/*.config.mjs",
			"**/*.config.ts",
		],
	},
	...compat.config(baseConfig),
	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			parserOptions: {
				project: ["./tsconfig.json"],
				tsconfigRootDir: __dirname,
			},
		},
	},
];
