ALTER TABLE "lobbies" DROP COLUMN "blank_cards_enabled";
ALTER TABLE "lobbies" ADD COLUMN "house_rules" text[] DEFAULT '{}' NOT NULL;
