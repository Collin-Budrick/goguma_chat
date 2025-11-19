import preset from "@goguma/config/tailwind/base";
import type { Config } from "tailwindcss";

const config: Config = {
	content: [
		"./app/**/*.{ts,tsx,js,jsx,mdx}",
		"./components/**/*.{ts,tsx,js,jsx,mdx}",
		"../../packages/ui/src/**/*.{ts,tsx,js,jsx}",
	],
	presets: [preset],
	theme: {
		extend: {
			keyframes: {
				gradient: {
					"0%": { backgroundPosition: "0% 50%" },
					"50%": { backgroundPosition: "100% 50%" },
					"100%": { backgroundPosition: "0% 50%" },
				},
			},
			animation: {
				gradient: "gradient 8s linear infinite",
			},
		},
	},
};

export default config;
