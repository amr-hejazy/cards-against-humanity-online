CREATE TABLE "player_hands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_player_id" uuid NOT NULL,
	"white_card_id" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "player_hands_game_player_id_position_unique" UNIQUE("game_player_id","position"),
	CONSTRAINT "player_hands_game_player_id_white_card_id_unique" UNIQUE("game_player_id","white_card_id")
);
--> statement-breakpoint
ALTER TABLE "game_players" DROP CONSTRAINT "game_players_game_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "game_players" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "player_hands" ADD CONSTRAINT "player_hands_game_player_id_game_players_id_fk" FOREIGN KEY ("game_player_id") REFERENCES "public"."game_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_hands" ADD CONSTRAINT "player_hands_white_card_id_cards_id_fk" FOREIGN KEY ("white_card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_user_id_unique" UNIQUE("game_id","user_id");