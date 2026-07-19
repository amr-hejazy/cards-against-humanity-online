DROP TABLE "player_hands" CASCADE;--> statement-breakpoint
DROP TABLE "submissions" CASCADE;--> statement-breakpoint
ALTER TABLE "games" DROP COLUMN "current_round";--> statement-breakpoint
DROP TYPE "public"."submission_status";