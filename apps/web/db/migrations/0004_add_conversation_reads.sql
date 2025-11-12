CREATE TABLE IF NOT EXISTS "conversation_reads" (
  "conversation_id" text NOT NULL,
  "user_id" text NOT NULL,
  "last_read_message_id" text,
  "last_read_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "conversation_reads_conversation_id_user_id_pk" PRIMARY KEY ("conversation_id", "user_id"),
  CONSTRAINT "conversation_reads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE,
  CONSTRAINT "conversation_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "conversation_reads_last_read_message_id_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "messages"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "conversation_reads_last_read_idx"
  ON "conversation_reads" ("last_read_at");
