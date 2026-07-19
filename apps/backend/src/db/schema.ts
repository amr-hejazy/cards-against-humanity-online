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



export const CardTypeEnum = pgEnum("card_type", ["WHITE", "BLACK"]);

export const cards = pgTable("cards", {
  id: integer("id").primaryKey(), // same index as compact.json
  type: CardTypeEnum("type").notNull(),
  text: text("text").notNull(),
  pick: integer("pick"), // null for white cards
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const cardPacks = pgTable("card_packs", {
  id: integer("id").primaryKey(), // 10, 23, 62... as in compact.json
  name: text("name").notNull(),
  official: boolean("official").notNull(),
});


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
