DO $$ BEGIN
  CREATE TYPE "messaging_mode" AS ENUM ('progressive', 'udp');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "conversations"
ADD COLUMN "messaging_mode" "messaging_mode" NOT NULL DEFAULT 'progressive';
