import { unique } from "drizzle-orm/pg-core";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * User
----
id -- should be UUID
username -- should be unique, not null, 30 chars is plenty
email -- should be unique, nullable
password_hash -- nullable
created_at -- use timestamp and not null, default to now
updated_at -- use timestamp and not null, default to now
 */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: varchar("username", { length: 30 }).notNull().unique(),
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 *  * Lobby
 * ------
 * id -- should be UUID
 * host_id -- foreign key to users.id, not null
 * status -- should be an enum with values "waiting", "in_progress", "finished", not null
 * room_code -- should be unique, not null, 6 chars
 * max_players -- should be an integer, not null, default to 4
 * created_at -- use timestamp and not null, default to now
 * updated_at -- use timestamp and not null, default to now
 */

export const LobbyStatusEnum = pgEnum("lobby_status", [
  "WAITING",
  "IN_PROGRESS",
]);

export const lobbies = pgTable("lobbies", {
  id: uuid("id").defaultRandom().primaryKey(),
  hostId: uuid("host_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  status: LobbyStatusEnum("status").notNull().default("WAITING"),
  roomCode: varchar("room_code", { length: 6 }).notNull().unique(),
  maxPlayers: integer("max_players").notNull().default(4),
  winningScore: integer("winning_score").notNull().default(5),
  maxRounds: integer("max_rounds").notNull().default(10),
  gameMode: text("game_mode").notNull().default("normal"),
  selectedPackIds: jsonb("selected_pack_ids").$type<number[] | null>(),
  houseRules: text("house_rules").array().notNull().default([]),
  roundTimeoutSeconds: integer("round_timeout_seconds").notNull().default(60),
  modeConfig: jsonb("mode_config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 *  LobbyPlayer
-----------
lobby_id - foreign key to lobbies.id, not null
user_id - foreign key to users.id, not null
is_ready - boolean, not null, default to false
joined_at - use timestamp and not null, default to now

- LobbyPlayer should have a unique constraint on (lobby_id, user_id)
 */

export const lobbyPlayers = pgTable(
  "lobby_players",
  {
    lobbyId: uuid("lobby_id")
      .notNull()
      .references(() => lobbies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isReady: boolean("is_ready").notNull().default(false),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    // Composite primary key ensures a user can appear only once per lobby. (but doesn't prevent a user from being in multiple lobbies, that's handled by the application logic)
    primaryKey({
      columns: [table.lobbyId, table.userId],
    }),
  ],
);

/**

 * Game
 * -----
 * id -- should be UUID
 * lobby_id -- foreign key to lobbies.id, not null
 * status -- should be an enum with values "waiting", "in_progress", "finished", not null
 * winner_id -- foreign key to users.id, nullable
 * started_at -- use timestamp and not null, default to now
 * ended_at -- use timestamp and nullable
 * created_at -- use timestamp and not null, default to now
 * updated_at -- use timestamp and not null, default to now

- Game status can be: in_progress, finished
*/

export const GameStatusEnum = pgEnum("game_status", [
  "IN_PROGRESS",
  "FINISHED",
]);

export const games = pgTable("games", {
  id: uuid("id").defaultRandom().primaryKey(),
  lobbyId: uuid("lobby_id")
    .notNull()
    .references(() => lobbies.id, { onDelete: "cascade" }),
  status: GameStatusEnum("status").notNull().default("IN_PROGRESS"),
  winnerId: uuid("winner_id").references(() => users.id, {
    onDelete: "set null",
  }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * GamePlayer
 * -----------
 * game_id -- foreign key to games.id, not null, on delete cascade
 * user_id -- foreign key to users.id, not null, on delete cascade
 * score -- integer, not null, default to 0
 * player_order -- integer, not null
 * joined_at -- use timestamp and not null, default to now

- GamePlayer should have a unique constraint on (game_id, user_id)
- score is an integer representing the player's score in the game
- player_order is an integer indicating the player's order in the game (1, 2, 3, ...) 
*/

export const gamePlayers = pgTable(
  "game_players",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: integer("score").notNull().default(0),
    playerOrder: integer("player_order").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    // prevent a user from being in the same game multiple times
    unique().on(table.gameId, table.userId),
  ],
);

/**
 * Card
 * -----
 * id -- should be integer, primary key (matches the id in compact.json)
 * type -- should be an enum with values "WHITE", "BLACK", not null
 * text -- should be text, not null
 * pick -- should be integer, nullable (only for black cards)
 * created_at -- use timestamp and not null, default to now
 */

export const CardTypeEnum = pgEnum("card_type", ["WHITE", "BLACK"]);

export const cards = pgTable("cards", {
  id: integer("id").primaryKey(), // same index as compact.json
  type: CardTypeEnum("type").notNull(),
  text: text("text").notNull(),
  pick: integer("pick"), // null for white cards
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * CardPack
 * -----
 * id -- should be integer, primary key (matches the id in compact.json)
 * name -- should be text, not null
 * official -- should be boolean, not null
 */
export const cardPacks = pgTable("card_packs", {
  id: integer("id").primaryKey(), // 10, 23, 62... as in compact.json
  name: text("name").notNull(),
  official: boolean("official").notNull(),
});

/**
 * CardPackCards
 * -----
 * pack_id -- foreign key to card_packs.id, not null
 * card_id -- foreign key to cards.id, not null
 *
 * - Composite primary key on (pack_id, card_id)
 * - Makes importing card packs easier, as we can just insert the pack and then insert the cards with the pack_id
 */

export const cardPackCards = pgTable(
  "card_pack_cards",
  {
    packId: integer("pack_id")
      .notNull()
      .references(() => cardPacks.id, { onDelete: "cascade" }),

    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({
      columns: [table.packId, table.cardId],
    }),
  ],
);

/**
 * Round
 * -----
 * id -- should be UUID
 * game_id -- foreign key to games.id, not null
 * round_number -- should be integer, not null
 * black_card_id -- foreign key to cards.id, not null
 * winner_id -- foreign key to game_players.id, nullable
 * judge_id -- foreign key to game_players.id, nullable
 * status -- should be an enum with values "waiting", "in_progress", "finished", not null
 * started_at -- use timestamp and not null, default to now
 * ended_at -- use timestamp and nullable

 - Round should have a unique constraint on (game_id, round_number)
 - Round status can be: playing, reveal, finished
 - judge_id is the user_id of the player who is the judge for this round (can be null if not assigned yet)
 - black card is randomly selected from the black card deck for this round
 */


