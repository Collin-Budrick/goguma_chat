DROP INDEX IF EXISTS "conversations_direct_key_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_direct_key_unique" ON "conversations" USING btree ("direct_key");
