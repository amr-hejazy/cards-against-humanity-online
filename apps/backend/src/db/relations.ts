import { relations } from "drizzle-orm";
import {
  gamePlayers,
  games,
  lobbies,
  lobbyPlayers,
  users,
} from "./schema";

// RELATION : One lobby has many players, and one host (user)
export const lobbyRelations = relations(lobbies, ({ many, one }) => ({
  host: one(users, {
    fields: [lobbies.hostId],
    references: [users.id],
  }),
  players: many(lobbyPlayers),
}));

// RELATION : One player belongs to one lobby and one user
export const lobbyPlayerRelations = relations(lobbyPlayers, ({ one }) => ({
  lobby: one(lobbies, {
    fields: [lobbyPlayers.lobbyId],
    references: [lobbies.id],
  }),
  user: one(users, {
    fields: [lobbyPlayers.userId],
    references: [users.id],
  }),
}));

// RELATION : One game has many players
export const gameRelations = relations(games, ({ many }) => ({
  players: many(gamePlayers),
}));

// RELATION : One game player belongs to one game and one user
export const gamePlayerRelations = relations(gamePlayers, ({ one }) => ({
  game: one(games, {
    fields: [gamePlayers.gameId],
    references: [games.id],
  }),

  user: one(users, {
    fields: [gamePlayers.userId],
    references: [users.id],
  }),
}));
