import { describe, it, expect } from "vitest";
import {
  submitCards,
  judgeSubmission,
} from "../../../src/features/game/game.service";
import { AppError, ErrorTypes } from "../../../src/core/error/errors";
import {
  setupLobbyWithPlayers,
  getNonJudgePlayerIds,
  pickCardsForSubmission,
  startAndGetGame,
} from "../../helpers";

describe("Race Conditions — Concurrent submitCards", () => {
  it("serializes concurrent submissions from different players", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    expect(nonJudgeIds.length).toBe(2);

    const submits = nonJudgeIds.map((pid) => {
      const cardIds = pickCardsForSubmission(state, pid);
      return submitCards(state.gameId, pid, cardIds);
    });

    const results = await Promise.all(submits);
    expect(results).toHaveLength(2);
    for (const s of results) {
      expect(s.currentRound!.submissions).toBeDefined();
    }

    expect(state.currentRound!.status).toBe("REVEAL");
  });

  it("allows only first concurrent submission from same player", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    const pid = nonJudgeIds[0];
    const cardIds = pickCardsForSubmission(state, pid);

    const samePlayerSubmits = [
      submitCards(state.gameId, pid, cardIds),
      submitCards(state.gameId, pid, cardIds),
    ];

    const results = await Promise.allSettled(samePlayerSubmits);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof AppError,
    );

    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(rejected.length).toBeGreaterThanOrEqual(1);
  });

  it("handles concurrent submit and judgeSubmission correctly", async () => {
    const { users: testUsers, roomCode } = await setupLobbyWithPlayers(3);
    const state = await startAndGetGame(roomCode, testUsers[0].id);

    const nonJudgeIds = getNonJudgePlayerIds(state);
    const judgeId = state.currentRound!.judgeGamePlayerId;

    await Promise.all(
      nonJudgeIds.map((pid) => {
        const cardIds = pickCardsForSubmission(state, pid);
        return submitCards(state.gameId, pid, cardIds);
      }),
    );

    expect(state.currentRound!.status).toBe("REVEAL");

    const result = await judgeSubmission(state.gameId, judgeId, nonJudgeIds[0]);
    expect(result.type).toBe("ROUND_WINNER");
    if (result.type !== "ROUND_WINNER") throw new Error();
    expect(result.winnerReveal.nextRoundNumber).toBe(2);
  });
});
