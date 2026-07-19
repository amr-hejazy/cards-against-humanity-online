CREATE TYPE "card_type" AS ENUM('WHITE', 'BLACK');--> statement-breakpoint
CREATE TABLE "card_pack_cards" (
	"pack_id" integer,
	"card_id" integer,
	CONSTRAINT "card_pack_cards_pkey" PRIMARY KEY("pack_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "card_packs" (
	"id" integer PRIMARY KEY,
	"name" text NOT NULL,
	"official" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" integer PRIMARY KEY,
	"type" "card_type" NOT NULL,
	"text" text NOT NULL,
	"pick" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_pack_cards" ADD CONSTRAINT "card_pack_cards_pack_id_card_packs_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "card_packs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "card_pack_cards" ADD CONSTRAINT "card_pack_cards_card_id_cards_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE;