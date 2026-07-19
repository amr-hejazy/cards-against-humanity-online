DROP TABLE "rounds" CASCADE;--> statement-breakpoint
ALTER TABLE "lobbies" ADD COLUMN "winning_score" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "lobbies" ADD COLUMN "max_rounds" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "lobbies" ADD COLUMN "game_mode" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "lobbies" ADD COLUMN "selected_pack_ids" jsonb;--> statement-breakpoint
DROP TYPE "public"."round_status";