import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { appSchema } from "./schema";

const globalForPool = globalThis as unknown as {
  __drizzlePool?: Pool;
};

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

if (!process.env.DATABASE_URL) {
  console.warn(
    "DATABASE_URL is not set. Using a placeholder connection string; update your environment variables (see .env.example).",
  );
}

const pool =
  globalForPool.__drizzlePool ??
  new Pool({
    connectionString,
    ssl:
      process.env.NODE_ENV === "production" && process.env.DATABASE_URL
        ? { rejectUnauthorized: false }
        : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPool.__drizzlePool = pool;
}

export const db = drizzle(pool, { schema: appSchema });

export type Database = typeof db;
