DO $$
BEGIN
  CREATE TYPE "conversation_type" AS ENUM ('direct');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" text PRIMARY KEY,
  "type" "conversation_type" NOT NULL DEFAULT 'direct',
  "direct_key" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "conversations_direct_key_check" CHECK (("type" <> 'direct') OR ("direct_key" IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_direct_key_unique"
  ON "conversations" ("direct_key")
  WHERE "type" = 'direct';

CREATE TABLE IF NOT EXISTS "conversation_participants" (
  "conversation_id" text NOT NULL,
  "user_id" text NOT NULL,
  "joined_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY ("conversation_id", "user_id"),
  CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE,
  CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" text PRIMARY KEY,
  "conversation_id" text NOT NULL,
  "sender_id" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE,
  CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "messages_conversation_created_idx"
  ON "messages" ("conversation_id", "created_at", "id");
