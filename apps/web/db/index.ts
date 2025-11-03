import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { authSchema } from "./schema";

const globalForPool = globalThis as unknown as {
  __drizzlePool?: Pool;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Update your environment variables (see .env.example).",
  );
}

const pool =
  globalForPool.__drizzlePool ??
  new Pool({
    connectionString,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPool.__drizzlePool = pool;
}

export const db = drizzle(pool, { schema: authSchema });

export type Database = typeof db;
