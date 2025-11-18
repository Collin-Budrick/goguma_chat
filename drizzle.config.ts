import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
	console.warn("DATABASE_URL is not set. Drizzle commands may fail.");
}

export default defineConfig({
	schema: "./apps/web/db/schema.ts",
	out: "./apps/web/db/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL ?? "",
	},
});
