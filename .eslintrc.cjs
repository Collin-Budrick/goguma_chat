module.exports = {
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
  overrides: [
    {
      files: ["apps/web/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: ["apps/web/tsconfig.json", "tsconfig.base.json"],
        tsconfigRootDir: __dirname,
      },
      plugins: ["@typescript-eslint", "react-hooks"],
      extends: ["plugin:@typescript-eslint/recommended", "plugin:react-hooks/recommended"],
      rules: {
        "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      },
    },
    {
      files: ["apps/native/**/*.{ts,tsx}"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: ["apps/native/tsconfig.json"],
        tsconfigRootDir: __dirname,
      },
      plugins: ["@typescript-eslint", "react-hooks", "react-native"],
      extends: [
        "plugin:@typescript-eslint/recommended",
        "plugin:react-hooks/recommended",
        "plugin:react-native/all",
      ],
      rules: {
        "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      },
    },
    {
      files: ["apps/native/**/*.{js,jsx}", "apps/web/**/*.{js,jsx}"],
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
      rules: {},
    },
  ],
};
