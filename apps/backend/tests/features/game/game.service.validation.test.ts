import { describe, it, expect } from "vitest";
import {
  submitCards,
  judgeSubmission,
  startNextRound,
  endGame,
} from "../../../src/features/game/game.service";
import { withGameLock } from "../../../src/features/game/game.state";
import { AppError, ErrorTypes } from "../../../src/core/error/errors";
import {
  setupLobbyWithPlayers,
  getNonJudgePlayerIds,
  pickCardsForSubmission,
  startAndGetGame,
} from "../../helpers";
import { db } from "../../../src/db/client";
import { lobbies, cardPacks, cardPackCards } from "../../../src/db/schema";
import { eq, inArray } from "drizzle-orm";

describe("submitCards Validation", () => {
  it("rejects judge submitting cards", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);
    const state = await startAndGetGame(roomCode, testUsers[0].id);
    const judgeId = state.currentRound!.judgeGamePlayerId;

    const err = await submitCards(state.gameId, judgeId, [1, 2]).catch(
      (e: any) => e,
    );

    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.JUDGE_CANNOT_SUBMIT);
  });

  it("rejects double submission from same player", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    const playerId = nonJudgeIds[0];
    const cardIds = pickCardsForSubmission(state, playerId);

    await submitCards(state.gameId, playerId, cardIds);

    const err = await submitCards(state.gameId, playerId, cardIds).catch(
      (e: any) => e,
    );

    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.INVALID_SUBMISSION);
  });

  it("rejects wrong card count", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    const playerId = nonJudgeIds[0];

    const err = await submitCards(state.gameId, playerId, []).catch(
      (e: any) => e,
    );

    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.INVALID_SUBMISSION);
  });

  it("rejects duplicate card ids in submission", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    const playerId = nonJudgeIds[0];
    const pick = state.currentRound!.blackCard.pick ?? 1;

    if (pick < 2) return;

    const player = state.players.get(playerId)!;
    const dupes = [player.hand[0].id, player.hand[0].id];
    const err = await submitCards(state.gameId, playerId, dupes).catch(
      (e: any) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.INVALID_SUBMISSION);
  });

  it("rejects card not in player's hand", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    const playerId = nonJudgeIds[0];
    const pick = state.currentRound!.blackCard.pick ?? 1;

    const fakeIds = Array.from({ length: pick }, (_, i) => 99999 + i);
    const err = await submitCards(state.gameId, playerId, fakeIds).catch(
      (e: any) => e,
    );

    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.INVALID_SUBMISSION);
  });
});

describe("judgeSubmission Validation", () => {
  it("rejects non-judge trying to judge", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);

    for (const pid of nonJudgeIds) {
      const cardIds = pickCardsForSubmission(state, pid);
      await submitCards(state.gameId, pid, cardIds);
    }

    const err = await judgeSubmission(
      state.gameId,
      nonJudgeIds[1],
      nonJudgeIds[0],
    ).catch((e: any) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.NOT_JUDGE);
  });

  it("rejects judge when round not REVEAL", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const judgeId = state.currentRound!.judgeGamePlayerId;
    const nonJudgeIds = getNonJudgePlayerIds(state);

    const err = await judgeSubmission(
      state.gameId,
      judgeId,
      nonJudgeIds[0],
    ).catch((e: any) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.ROUND_NOT_REVEAL);
  });

  it("rejects picking nonexistent player after all submitted", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);

    for (const pid of nonJudgeIds) {
      const cardIds = pickCardsForSubmission(state, pid);
      await submitCards(state.gameId, pid, cardIds);
    }

    const judgeId = state.currentRound!.judgeGamePlayerId;

    const err = await judgeSubmission(
      state.gameId,
      judgeId,
      "00000000-0000-0000-0000-000000000000",
    ).catch((e: any) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.type).toBe(ErrorTypes.INVALID_SUBMISSION);
  });
});

describe("Tie-breaker Extra Rounds", () => {
  it("extends game when MAX_ROUNDS reached with tied scores", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);
    let state = await startAndGetGame(roomCode, testUsers[0].id);

    let roundNumber = 0;

    while (true) {
      roundNumber++;
      const judgeId = state.currentRound!.judgeGamePlayerId;
      const nonJudgeIds = getNonJudgePlayerIds(state);

      for (const pid of nonJudgeIds) {
        const cardIds = pickCardsForSubmission(state, pid);
        await submitCards(state.gameId, pid, cardIds);
      }

      const winnerIndex = (roundNumber - 1) % nonJudgeIds.length;
      const chosenId = nonJudgeIds[winnerIndex];

      const result = await judgeSubmission(state.gameId, judgeId, chosenId);

      if (result.type === "GAME_ENDED") break;

      const winnerReveal = result.state.winnerReveal;
      if (winnerReveal?.isFinalRound) {
        await withGameLock(result.state.gameId, () =>
          endGame(result.state, winnerReveal.gameWinnerId ?? null),
        );
        break;
      }

      await withGameLock(result.state.gameId, () =>
        startNextRound(result.state),
      );
      state = result.state;
    }

    expect(roundNumber).toBe(10);
  });
});

describe("Game Start with Selected Packs", () => {
  it("starts game with only selected pack cards", async () => {
    const { users, roomCode } = await setupLobbyWithPlayers(3);
    const host = users[0];

    // Get a specific pack ID (first official pack)
    const packs = await db.query.cardPacks.findMany({
      columns: { id: true },
      where: eq(cardPacks.official, true),
      limit: 1,
    });
    const packId = packs[0].id;

    // Set lobby to only use that pack
    await db
      .update(lobbies)
      .set({
        selectedPackIds: [packId],
      })
      .where(eq(lobbies.roomCode, roomCode));

    const state = await startAndGetGame(roomCode, host.id);

    // Get all card IDs for that pack
    const relations = await db
      .select({ cardId: cardPackCards.cardId })
      .from(cardPackCards)
      .where(eq(cardPackCards.packId, packId));
    const packCardIds = new Set(relations.map((r) => r.cardId));

    // Verify all cards in all players' hands belong to that pack
    for (const [, player] of state!.players) {
      for (const card of player.hand) {
        expect(packCardIds.has(card.id)).toBe(true);
      }
    }
  });
});
