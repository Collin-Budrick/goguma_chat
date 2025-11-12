CREATE TYPE "public"."friend_request_status" AS ENUM('pending', 'accepted', 'declined', 'cancelled');--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"status" "friend_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "friend_requests_sender_recipient_check" CHECK ("friend_requests"."sender_id" <> "friend_requests"."recipient_id")
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"friend_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_user_friend_check" CHECK ("friendships"."user_id" <> "friendships"."friend_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_pending_unique" ON "friend_requests" USING btree (LEAST("sender_id", "recipient_id"),GREATEST("sender_id", "recipient_id")) WHERE "friend_requests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_unique_pair" ON "friendships" USING btree (LEAST("user_id", "friend_id"),GREATEST("user_id", "friend_id"),("user_id" < "friend_id"));