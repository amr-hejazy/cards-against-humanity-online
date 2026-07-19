import { describe, it, expect } from "vitest";
import {
  createLobby,
  joinLobby,
} from "../../../src/features/lobby/lobby.service";
import { setPlayerReady } from "../../../src/features/lobby/lobby.helpers";
import { startGame } from "../../../src/features/game/game.service";
import { AppError, ErrorTypes } from "../../../src/core/error/errors";
import { createTestUser } from "../../helpers";

describe("Lobby Creation Validation", () => {
  it("rejects maxPlayers < 3", async () => {
    const user = await createTestUser();
    const err = await createLobby(user.id, 2).catch((e: any) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.LOBBY_SIZE_INVALID);
  });

  it("rejects maxPlayers > 10", async () => {
    const user = await createTestUser();
    const err = await createLobby(user.id, 11).catch((e: any) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.LOBBY_SIZE_INVALID);
  });

  it("rejects user already in a lobby", async () => {
    const user = await createTestUser();
    await createLobby(user.id, 4);
    const err = await createLobby(user.id, 4).catch((e: any) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.PLAYER_ALREADY_IN_LOBBY);
  });

  it("creates lobby with default settings values", async () => {
    const user = await createTestUser();
    const lobby = await createLobby(user.id, 4);
    expect(lobby.winningScore).toBe(5);
    expect(lobby.maxRounds).toBe(10);
    expect(lobby.gameMode).toBe("normal");
    expect(lobby.selectedPackIds).toBeNull();
  });
});

describe("Lobby Join Validation", () => {
  it("rejects joining nonexistent lobby", async () => {
    const user = await createTestUser();
    const err = await joinLobby("XXXXXX", user.id).catch((e: any) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.LOBBY_NOT_FOUND);
  });

  it("rejoins when user already in lobby", async () => {
    const host = await createTestUser();
    const lobby = await createLobby(host.id, 4);
    const result = await joinLobby(lobby.roomCode, host.id);
    expect(result.roomCode).toBe(lobby.roomCode);
    expect(result.players).toHaveLength(1);
  });

  it("rejects join when lobby full", async () => {
    const u1 = await createTestUser();
    const u2 = await createTestUser();
    const u3 = await createTestUser();
    const u4 = await createTestUser();
    const lobby = await createLobby(u1.id, 3);
    await joinLobby(lobby.roomCode, u2.id);
    await joinLobby(lobby.roomCode, u3.id);
    const err = await joinLobby(lobby.roomCode, u4.id).catch((e: any) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.LOBBY_FULL);
  });
});

describe("Game Start Validation", () => {
  it("rejects start when not host", async () => {
    const u1 = await createTestUser();
    const u2 = await createTestUser();
    const u3 = await createTestUser();
    const lobby = await createLobby(u1.id, 3);
    const roomCode = lobby.roomCode;
    await joinLobby(roomCode, u2.id);
    await joinLobby(roomCode, u3.id);
    await setPlayerReady(lobby.id, u1.id, true);
    await setPlayerReady(lobby.id, u2.id, true);
    await setPlayerReady(lobby.id, u3.id, true);

    const err = await startGame(roomCode, u2.id).catch((e: any) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.NOT_HOST);
  });

  it("rejects start with < 3 players", async () => {
    const user = await createTestUser();
    const lobby = await createLobby(user.id, 3);
    await setPlayerReady(lobby.id, user.id, true);

    const err = await startGame(lobby.roomCode, user.id).catch((e: any) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.NOT_ENOUGH_PLAYERS);
  });

  it("rejects start when not all ready", async () => {
    const u1 = await createTestUser();
    const u2 = await createTestUser();
    const u3 = await createTestUser();
    const lobby = await createLobby(u1.id, 3);
    const roomCode = lobby.roomCode;
    await joinLobby(roomCode, u2.id);
    await joinLobby(roomCode, u3.id);
    await setPlayerReady(lobby.id, u1.id, true);
    await setPlayerReady(lobby.id, u2.id, true);

    const err = await startGame(roomCode, u1.id).catch((e: any) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.PLAYERS_NOT_READY);
  });
});
