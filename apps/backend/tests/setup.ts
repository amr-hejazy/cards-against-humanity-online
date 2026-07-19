import { beforeEach, afterAll } from "vitest";
import { db } from "../src/db/client";
import {
  gamePlayers,
  games,
  lobbyPlayers,
  lobbies,
  users,
} from "../src/db/schema";
import { clearAllGameStates } from "../src/features/game/game.state";

beforeEach(async () => {
  clearAllGameStates();
  try {
    await db.transaction(async (tx) => {
      await tx.delete(gamePlayers);
      await tx.delete(games);
      await tx.delete(lobbyPlayers);
      await tx.delete(lobbies);
      await tx.delete(users);
    });
  } catch {
    // cleanup may fail if data partially exists; ignore, next test starts fresh
  }
});
