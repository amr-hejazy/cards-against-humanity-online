import { describe, it, expect, vi } from "vitest";
import { db } from "../../../src/db/client";
import { games, lobbies } from "../../../src/db/schema";
import { eq } from "drizzle-orm";
import {
  submitCards,
  judgeSubmission,
  startNextRound,
  endGame,
  startGame,
} from "../../../src/features/game/game.service";
import {
  findGameByLobbyId,
  findGameByGameId,
  withGameLock,
} from "../../../src/features/game/game.state";
import { leaveLobby } from "../../../src/features/lobby/lobby.service";
import {
  setupLobbyWithPlayers,
  getNonJudgePlayerIds,
  pickCardsForSubmission,
  startAndGetGame,
} from "../../helpers";

const playUntilGameEnds = async (gameId: string, initialState: any) => {
  let state = initialState;
  let results: any = null;

  while (true) {
    const judgeId = state.currentRound.judgeGamePlayerId;
    const nonJudgeIds = getNonJudgePlayerIds(state);

    for (const pid of nonJudgeIds) {
      const cardIds = pickCardsForSubmission(state, pid);
      await submitCards(gameId, pid, cardIds);
    }

    const chosenId = nonJudgeIds[0];
    const result = await judgeSubmission(gameId, judgeId, chosenId);

    if (result.type === "GAME_ENDED") {
      results = result.results;
      break;
    }

    const winnerReveal = result.state.winnerReveal;
    if (winnerReveal?.isFinalRound) {
      const endResults = await withGameLock(result.state.gameId, () =>
        endGame(result.state, winnerReveal.gameWinnerId ?? null),
      );
      results = endResults;
      break;
    }

    await withGameLock(result.state.gameId, () => startNextRound(result.state));
    state = result.state;
  }

  return results;
};

describe("Full Game Flow", () => {
  it("plays complete game with 3 players to MAX_ROUNDS", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);

    const state = await startAndGetGame(roomCode, testUsers[0].id);
    expect(state.players.size).toBe(3);

    await playUntilGameEnds(state.gameId, state);

    const dbGame = await db.query.games.findFirst({
      where: eq(games.id, state.gameId),
    });
    expect(dbGame?.status).toBe("FINISHED");

    const dbLobby = await db.query.lobbies.findFirst({
      where: eq(lobbies.id, state.lobbyId),
    });
    expect(dbLobby?.status).toBe("WAITING");

    const inMemory = findGameByLobbyId(state.lobbyId);
    expect(inMemory).toBeUndefined();
  });
});

describe("endGame Transaction Atomicity", () => {
  it("updates both game and lobby in same transaction on game end", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);

    const state = await startAndGetGame(roomCode, testUsers[0].id);
    await playUntilGameEnds(state.gameId, state);

    const [dbGame, dbLobby] = await Promise.all([
      db.query.games.findFirst({ where: eq(games.id, state.gameId) }),
      db.query.lobbies.findFirst({ where: eq(lobbies.id, state.lobbyId) }),
    ]);

    expect(dbGame?.status).toBe("FINISHED");
    expect(dbLobby?.status).toBe("WAITING");
  });
});

describe("Player leaves mid-game with enough players remaining", () => {
  it("continues game with remaining players when 1 of 4 leaves", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(4);

    const state = await startAndGetGame(roomCode, testUsers[0].id);
    expect(state.players.size).toBe(4);

    // Play first round to verify game is functional
    let judgeId = state.currentRound!.judgeGamePlayerId;
    let nonJudgeIds = getNonJudgePlayerIds(state);

    for (const pid of nonJudgeIds) {
      const cardIds = pickCardsForSubmission(state, pid);
      await submitCards(state.gameId, pid, cardIds);
    }
    let result = await judgeSubmission(state.gameId, judgeId, nonJudgeIds[0]);
    expect(result.type).toBe("ROUND_WINNER");
    if (result.type !== "ROUND_WINNER") throw new Error();
    const snrState = result.state;
    await withGameLock(snrState.gameId, () => startNextRound(snrState));
    expect(snrState.currentRound!.number).toBe(2);

    // One player leaves mid-game
    const leavingUser = testUsers[3];
    const { lobby, gameCancelled } = await leaveLobby(roomCode, leavingUser.id);
    expect(gameCancelled).toBe(false);
    expect(lobby).not.toBeNull();

    // Verify game state: 3 players remain
    const afterState = findGameByGameId(state.gameId);
    expect(afterState).toBeDefined();
    expect(afterState!.players.size).toBe(3);

    // Remaining players can continue the game
    const round2State = afterState!;
    judgeId = round2State.currentRound!.judgeGamePlayerId;
    nonJudgeIds = getNonJudgePlayerIds(round2State);
    expect(nonJudgeIds.length).toBe(2);

    for (const pid of nonJudgeIds) {
      const cardIds = pickCardsForSubmission(round2State, pid);
      await submitCards(round2State.gameId, pid, cardIds);
    }
    result = await judgeSubmission(round2State.gameId, judgeId, nonJudgeIds[0]);
    expect(result.type).toBe("ROUND_WINNER");
    if (result.type !== "ROUND_WINNER") throw new Error();
    await withGameLock(result.state.gameId, () => startNextRound(result.state));
    expect(result.state.currentRound!.number).toBe(3);
  });
});

describe("Winner reveal state", () => {
  it("populates winnerReveal correctly after judge picks", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(4);
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const judgeId = state.currentRound!.judgeGamePlayerId;
    const nonJudgeIds = getNonJudgePlayerIds(state);

    for (const pid of nonJudgeIds) {
      const cardIds = pickCardsForSubmission(state, pid);
      await submitCards(state.gameId, pid, cardIds);
    }

    const result = await judgeSubmission(state.gameId, judgeId, nonJudgeIds[0]);

    expect(result.type).toBe("ROUND_WINNER");
    if (result.type !== "ROUND_WINNER") throw new Error();
    expect(result.state.currentRound).toBeNull();
    expect(result.state.winnerReveal).toBeDefined();
    expect(result.state.winnerReveal!.winnerGamePlayerId).toBe(nonJudgeIds[0]);
    expect(result.state.winnerReveal!.previousJudgeGamePlayerId).toBe(judgeId);
    expect(result.state.winnerReveal!.pointsAwarded).toBe(1);
    expect(result.state.winnerReveal!.nextRoundNumber).toBe(2);
    expect(result.state.winnerReveal!.autoAdvanceAt).toBeInstanceOf(Date);
  });
});

describe("Manual next round", () => {
  it("starts next round with correct judge and round number after winner reveal", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(4);
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const round1JudgeId = state.currentRound!.judgeGamePlayerId;
    const nonJudgeIds = getNonJudgePlayerIds(state);

    for (const pid of nonJudgeIds) {
      const cardIds = pickCardsForSubmission(state, pid);
      await submitCards(state.gameId, pid, cardIds);
    }

    const result = await judgeSubmission(state.gameId, round1JudgeId, nonJudgeIds[0]);
    expect(result.type).toBe("ROUND_WINNER");
    if (result.type !== "ROUND_WINNER") throw new Error();

    // Manually advance
    await withGameLock(result.state.gameId, () => startNextRound(result.state));

    expect(result.state.currentRound).not.toBeNull();
    expect(result.state.currentRound!.number).toBe(2);
    expect(result.state.currentRound!.status).toBe("PLAYING");
    expect(result.state.currentRound!.judgeGamePlayerId).not.toBe(round1JudgeId);
    expect(result.state.currentRound!.blackCard).toBeDefined();
    expect(result.state.winnerReveal).toBeNull();

    // All players have cards
    for (const player of result.state.players.values()) {
      expect(player.hand.length).toBeGreaterThan(0);
    }
  });
});

describe("Judge reassignment on leave", () => {
  it("assigns new judge when judge leaves mid-round and round continues", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(4);
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const judgeId = state.currentRound!.judgeGamePlayerId;
    const judgeUserId = [...state.players.values()].find(
      (p) => p.gamePlayerId === judgeId,
    )!.userId;
    const judgeUserIdx = testUsers.findIndex((u) => u.id === judgeUserId);
    const leavingUser = testUsers[judgeUserIdx];
    const { lobby, gameCancelled } = await leaveLobby(roomCode, leavingUser.id);
    expect(gameCancelled).toBe(false);
    expect(lobby).not.toBeNull();
    expect(lobby!.status).toBe("IN_PROGRESS");

    const afterState = findGameByGameId(state.gameId);
    expect(afterState).toBeDefined();
    expect(afterState!.players.size).toBe(3);

    // New judge assigned
    const newJudgeId = afterState!.currentRound!.judgeGamePlayerId;
    expect(newJudgeId).not.toBe(judgeId);
    expect(afterState!.players.has(newJudgeId)).toBe(true);

    // Remaining non-judges submit cards
    const nonJudgeIds = getNonJudgePlayerIds(afterState!);
    for (const pid of nonJudgeIds) {
      const cardIds = pickCardsForSubmission(afterState!, pid);
      await submitCards(afterState!.gameId, pid, cardIds);
    }

    // New judge can pick winner
    const result = await judgeSubmission(
      afterState!.gameId,
      newJudgeId,
      nonJudgeIds[0],
    );
    expect(result.type).toBe("ROUND_WINNER");
    if (result.type !== "ROUND_WINNER") throw new Error();
    expect(result.state.winnerReveal!.winnerGamePlayerId).toBe(nonJudgeIds[0]);
  });
});

describe("blank cards", () => {
  it("blankCardsEnabled false by default, no blanks in hand", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);
    const state = await startAndGetGame(roomCode, testUsers[0].id);
    expect(state.blankCardsEnabled).toBe(false);
    for (const player of state.players.values()) {
      expect(player.hand.some((c) => c.isBlank)).toBe(false);
    }
  });

  it("blankCardsEnabled true when lobby setting is on", async () => {
    const { users: testUsers, lobby, roomCode } = await setupLobbyWithPlayers(3);
    await db.update(lobbies).set({ houseRules: ["blank_cards"] }).where(eq(lobbies.id, lobby.id));
    const state = await startAndGetGame(roomCode, testUsers[0].id);
    expect(state.blankCardsEnabled).toBe(true);
  });

  it("blank cards use negative IDs", async () => {
    const { users: testUsers, lobby, roomCode } = await setupLobbyWithPlayers(3);
    await db.update(lobbies).set({ houseRules: ["blank_cards"] }).where(eq(lobbies.id, lobby.id));
    const state = await startAndGetGame(roomCode, testUsers[0].id);
    expect(state.nextBlankId).toBeLessThan(0);
  });

  it("blank card submitted with custom text stores correctly", async () => {
    const { users: testUsers, lobby, roomCode } = await setupLobbyWithPlayers(3);
    await db.update(lobbies).set({ houseRules: ["blank_cards"] }).where(eq(lobbies.id, lobby.id));
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    const playerId = nonJudgeIds[0];
    const player = state.players.get(playerId)!;
    const pick = state.currentRound!.blackCard.pick ?? 1;

    const blankId = -999;
    player.hand.push({
      id: blankId,
      type: "WHITE",
      text: "",
      pick: null,
      isBlank: true,
    });

    const submitIds = [blankId, ...player.hand.slice(0, pick - 1).map((c) => c.id)];
    const customText = "My custom blank answer!";
    const customTexts: Record<string, string> = { [blankId.toString()]: customText };
    await submitCards(state.gameId, playerId, submitIds, customTexts);

    const submission = state.currentRound!.submissions[playerId];
    expect(submission).toBeDefined();
    expect(submission.cards.some((c) => c.isBlank)).toBe(true);
    expect(submission.cards.find((c) => c.isBlank)!.customText).toBe(customText);
  });

  it("blank card submitted without text throws VALIDATION_ERROR", async () => {
    const { users: testUsers, lobby, roomCode } = await setupLobbyWithPlayers(3);
    await db.update(lobbies).set({ houseRules: ["blank_cards"] }).where(eq(lobbies.id, lobby.id));
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    const playerId = nonJudgeIds[0];
    const player = state.players.get(playerId)!;
    const pick = state.currentRound!.blackCard.pick ?? 1;

    const blankId = -998;
    player.hand.push({
      id: blankId,
      type: "WHITE",
      text: "",
      pick: null,
      isBlank: true,
    });

    const submitIds = [blankId, ...player.hand.slice(0, pick - 1).map((c) => c.id)];
    const customTexts: Record<string, string> = { [blankId.toString()]: "" };
    await expect(
      submitCards(state.gameId, playerId, submitIds, customTexts),
    ).rejects.toThrow("Blank card must have custom text");
  });

  it("blank card submitted when blankCardsEnabled off throws VALIDATION_ERROR", async () => {
    const { users: testUsers, lobby, roomCode } = await setupLobbyWithPlayers(3);
    const state = await startAndGetGame(roomCode, testUsers[0].id);
    expect(state.blankCardsEnabled).toBe(false);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    const playerId = nonJudgeIds[0];
    const player = state.players.get(playerId)!;
    const pick = state.currentRound!.blackCard.pick ?? 1;

    const blankId = -997;
    player.hand.push({
      id: blankId,
      type: "WHITE",
      text: "",
      pick: null,
      isBlank: true,
    });

    const submitIds = [blankId, ...player.hand.slice(0, pick - 1).map((c) => c.id)];
    await expect(
      submitCards(state.gameId, playerId, submitIds, { [blankId.toString()]: "text" }),
    ).rejects.toThrow("Blank cards are not enabled");
  });

  it("blanks filtered from discard pile on round transition", async () => {
    const { users: testUsers, lobby, roomCode } = await setupLobbyWithPlayers(3);
    await db.update(lobbies).set({ houseRules: ["blank_cards"] }).where(eq(lobbies.id, lobby.id));
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    const playerId = nonJudgeIds[0];
    const player = state.players.get(playerId)!;
    const pick = state.currentRound!.blackCard.pick ?? 1;

    const blankId = -996;
    player.hand.push({
      id: blankId,
      type: "WHITE",
      text: "",
      pick: null,
      isBlank: true,
    });

    const submitCardIds = player.hand.slice(0, pick).map((c) => c.id);
    const customTexts: Record<string, string> = {};
    for (const id of submitCardIds) {
      if (id < 0) customTexts[id.toString()] = `custom_${id}`;
    }
    await submitCards(state.gameId, playerId, submitCardIds, customTexts);

    const remainingNonJudge = nonJudgeIds.slice(1);
    for (const pid of remainingNonJudge) {
      const cardIds = pickCardsForSubmission(state, pid);
      await submitCards(state.gameId, pid, cardIds);
    }

    const judgeId = state.currentRound!.judgeGamePlayerId;
    await judgeSubmission(state.gameId, judgeId, playerId);

    await withGameLock(state.gameId, () => startNextRound(state));

    const hasBlankInDiscard = state.discardPile.some((c) => c.isBlank);
    expect(hasBlankInDiscard).toBe(false);
  });

  it("blanks filtered from discard pile on player leave", async () => {
    const { users: testUsers, lobby, roomCode } = await setupLobbyWithPlayers(4);
    await db.update(lobbies).set({ houseRules: ["blank_cards"] }).where(eq(lobbies.id, lobby.id));
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    const playerId = nonJudgeIds[0];
    const player = state.players.get(playerId)!;
    const leavingUserId = player.userId;

    const blankId = -995;
    player.hand.push({
      id: blankId,
      type: "WHITE",
      text: "",
      pick: null,
      isBlank: true,
    });

    await leaveLobby(roomCode, leavingUserId);

    const hasBlankInDiscard = state.discardPile.some((c) => c.isBlank);
    expect(hasBlankInDiscard).toBe(false);
  });

  it("startNextRound deals blank cards when blankCardsEnabled is true", async () => {
    const { users: testUsers, lobby, roomCode } = await setupLobbyWithPlayers(3);
    await db.update(lobbies).set({ houseRules: ["blank_cards"] }).where(eq(lobbies.id, lobby.id));
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    for (const pid of nonJudgeIds) {
      const cardIds = pickCardsForSubmission(state, pid);
      await submitCards(state.gameId, pid, cardIds);
    }
    const judgeId = state.currentRound!.judgeGamePlayerId;
    await judgeSubmission(state.gameId, judgeId, nonJudgeIds[0]);

    vi.spyOn(Math, "random").mockReturnValue(0);
    await withGameLock(state.gameId, () => startNextRound(state));
    vi.restoreAllMocks();

    const blanksDealt = [...state.players.values()].filter((p) =>
      p.hand.some((c) => c.isBlank),
    ).length;
    expect(state.blankCardsEnabled).toBe(true);
    expect(state.nextBlankId).toBeLessThan(0);
    expect(blanksDealt).toBeGreaterThan(0);
  });

  it("max 1 blank per hand — no second blank added", async () => {
    const { users: testUsers, lobby, roomCode } = await setupLobbyWithPlayers(3);
    await db.update(lobbies).set({ houseRules: ["blank_cards"] }).where(eq(lobbies.id, lobby.id));
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    const playerId = nonJudgeIds[0];
    const player = state.players.get(playerId)!;

    player.hand.push({
      id: -1000,
      type: "WHITE",
      text: "",
      pick: null,
      isBlank: true,
    });

    for (const pid of nonJudgeIds) {
      const cardIds = pickCardsForSubmission(state, pid);
      await submitCards(state.gameId, pid, cardIds);
    }
    const judgeId = state.currentRound!.judgeGamePlayerId;
    await judgeSubmission(state.gameId, judgeId, nonJudgeIds[0]);

    await withGameLock(state.gameId, () => startNextRound(state));

    const updatedPlayer = state.players.get(playerId);
    const blankCards = updatedPlayer!.hand.filter((c) => c.isBlank);
    expect(blankCards.length).toBe(1);
  });
});
