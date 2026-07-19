ALTER TABLE "lobbies" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "lobbies" ALTER COLUMN "status" SET DEFAULT 'WAITING'::text;--> statement-breakpoint
DROP TYPE "public"."lobby_status";--> statement-breakpoint
CREATE TYPE "public"."lobby_status" AS ENUM('WAITING', 'IN_PROGRESS');--> statement-breakpoint
ALTER TABLE "lobbies" ALTER COLUMN "status" SET DEFAULT 'WAITING'::"public"."lobby_status";--> statement-breakpoint
ALTER TABLE "lobbies" ALTER COLUMN "status" SET DATA TYPE "public"."lobby_status" USING "status"::"public"."lobby_status";