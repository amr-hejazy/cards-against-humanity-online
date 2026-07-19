import { describe, it, expect } from "vitest";
import {
  createLobby,
  joinLobby,
  leaveLobby,
} from "../../../src/features/lobby/lobby.service";
import {
  setPlayerReady,
  removeUserFromLobby,
} from "../../../src/features/lobby/lobby.helpers";
import { startGame } from "../../../src/features/game/game.service";
import { findGameByLobbyId } from "../../../src/features/game/game.state";
import { AppError, ErrorTypes } from "../../../src/core/error/errors";
import { db } from "../../../src/db/client";
import { games, lobbies } from "../../../src/db/schema";
import { eq } from "drizzle-orm";
import { createTestUser } from "../../helpers";

describe("Lobby — Leave Mid-Game", () => {
  it("cancels game and resets lobby when player leaves mid-game", async () => {
    const u1 = await createTestUser();
    const u2 = await createTestUser();
    const u3 = await createTestUser();
    const lobby = await createLobby(u1.id, 3);
    const rc = lobby.roomCode;
    await joinLobby(rc, u2.id);
    await joinLobby(rc, u3.id);
    await setPlayerReady(lobby.id, u1.id, true);
    await setPlayerReady(lobby.id, u2.id, true);
    await setPlayerReady(lobby.id, u3.id, true);

    const { game } = await startGame(rc, u1.id);
    expect(findGameByLobbyId(lobby.id)).toBeDefined();

    const dbGame = await db.query.games.findFirst({
      where: eq(games.id, game.id),
    });
    expect(dbGame?.status).toBe("IN_PROGRESS");

    await leaveLobby(rc, u2.id);

    const inMemory = findGameByLobbyId(lobby.id);
    expect(inMemory).toBeUndefined();

    const dbLobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.id, lobby.id),
    });
    expect(dbLobby?.status).toBe("WAITING");
  });
});

describe("Lobby — Host Transfer", () => {
  it("transfers host when host leaves", async () => {
    const u1 = await createTestUser();
    const u2 = await createTestUser();
    const u3 = await createTestUser();
    const lobby = await createLobby(u1.id, 3);
    const rc = lobby.roomCode;
    await joinLobby(rc, u2.id);
    await joinLobby(rc, u3.id);

    const result = await leaveLobby(rc, u1.id);
    expect(result.lobby).not.toBeNull();
    expect(result.lobby!.hostId).toBe(u2.id);
  });

  it("transfers host to next player when multiple leave", async () => {
    const u1 = await createTestUser();
    const u2 = await createTestUser();
    const u3 = await createTestUser();
    const lobby = await createLobby(u1.id, 3);
    const rc = lobby.roomCode;
    await joinLobby(rc, u2.id);
    await joinLobby(rc, u3.id);

    await leaveLobby(rc, u1.id);

    const result = await leaveLobby(rc, u2.id);
    expect(result.lobby).not.toBeNull();
    expect(result.lobby!.hostId).toBe(u3.id);
  });

  it("deletes lobby when last player leaves", async () => {
    const u1 = await createTestUser();
    const lobby = await createLobby(u1.id, 3);
    const result = await leaveLobby(lobby.roomCode, u1.id);
    expect(result.lobby).toBeNull();
    expect(result.gameCancelled).toBe(true);
  });
});

describe("Lobby — Disconnect Cleanup (removeUserFromLobby)", () => {
  it("removes user from lobby by userId", async () => {
    const u1 = await createTestUser();
    const u2 = await createTestUser();
    const lobby = await createLobby(u1.id, 3);
    const rc = lobby.roomCode;
    await joinLobby(rc, u2.id);

    const result = await removeUserFromLobby(u2.id);
    expect(result).not.toBeNull();
    expect(result!.roomCode).toBe(rc);
    expect(result!.lobby!.players).toHaveLength(1);
  });

  it("returns null if user not in any lobby", async () => {
    const user = await createTestUser();
    const result = await removeUserFromLobby(user.id);
    expect(result).toBeNull();
  });

  it("cancels game when disconnecting mid-game", async () => {
    const u1 = await createTestUser();
    const u2 = await createTestUser();
    const u3 = await createTestUser();
    const lobby = await createLobby(u1.id, 3);
    const rc = lobby.roomCode;
    await joinLobby(rc, u2.id);
    await joinLobby(rc, u3.id);
    await setPlayerReady(lobby.id, u1.id, true);
    await setPlayerReady(lobby.id, u2.id, true);
    await setPlayerReady(lobby.id, u3.id, true);

    await startGame(rc, u1.id);
    expect(findGameByLobbyId(lobby.id)).toBeDefined();

    await removeUserFromLobby(u2.id);

    const inMemory = findGameByLobbyId(lobby.id);
    expect(inMemory).toBeUndefined();
  });
});

describe("Lobby — Assert User Not In Lobby", () => {
  it("blocks user from creating second lobby", async () => {
    const u1 = await createTestUser();
    await createLobby(u1.id, 3);
    const err = await createLobby(u1.id, 4).catch((e: any) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.PLAYER_ALREADY_IN_LOBBY);
  });
});
