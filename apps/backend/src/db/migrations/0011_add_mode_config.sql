ALTER TABLE "lobbies" ADD COLUMN "mode_config" jsonb DEFAULT '{}'::jsonb NOT NULL;
