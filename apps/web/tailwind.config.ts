import type { Config } from "tailwindcss";
import preset from "@goguma/config/tailwind/base";

const config: Config = {
  content: ["./app/**/*.{ts,tsx,js,jsx,mdx}", "../../packages/ui/src/**/*.{ts,tsx,js,jsx}"],
  presets: [preset],
};

export default config;
