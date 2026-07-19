CREATE TYPE "public"."round_status" AS ENUM('PLAYING', 'REVEAL', 'FINISHED');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('PENDING', 'SELECTED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"black_card_id" integer NOT NULL,
	"winner_id" uuid,
	"judge_id" uuid,
	"status" "round_status" DEFAULT 'PLAYING' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	CONSTRAINT "rounds_game_id_round_number_unique" UNIQUE("game_id","round_number")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"game_player_id" uuid NOT NULL,
	"white_card_id" integer NOT NULL,
	"status" "submission_status" DEFAULT 'PENDING' NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_round_id_game_player_id_unique" UNIQUE("round_id","game_player_id"),
	CONSTRAINT "submissions_round_id_white_card_id_unique" UNIQUE("round_id","white_card_id")
);
--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_black_card_id_cards_id_fk" FOREIGN KEY ("black_card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_winner_id_game_players_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."game_players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_judge_id_game_players_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."game_players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_game_player_id_game_players_id_fk" FOREIGN KEY ("game_player_id") REFERENCES "public"."game_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_white_card_id_cards_id_fk" FOREIGN KEY ("white_card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;