ALTER TYPE "messaging_mode" ADD VALUE IF NOT EXISTS 'push';

ALTER TABLE "conversations"
ALTER COLUMN "messaging_mode" SET DEFAULT 'push';
