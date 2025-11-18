module.exports = {
	plugins: ["@typescript-eslint", "react-hooks"],
	extends: [
		"plugin:@typescript-eslint/recommended",
		"plugin:react-hooks/recommended",
	],
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaVersion: 2022,
		sourceType: "module",
	},
	settings: {
		react: {
			version: "detect",
		},
	},
	rules: {
		"@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
	},
};
