import { describe, it, expect } from "vitest";
import { CzarIsDeadStrategy } from "../../../../src/features/game/game-modes/czar-is-dead";
import type { GameState, GameRoundState } from "../../../../src/features/game/game.types";
import type { Card } from "@cah/shared";

function makeMockState(overrides: Partial<GameState> = {}): GameState {
  const mockCard: Card = { id: 1, type: "WHITE", text: "test", pick: null };
  return {
    gameId: "game1",
    lobbyId: "lobby1",
    roomCode: "ABC123",
    whiteDeck: [mockCard],
    blackDeck: [{ id: 2, type: "BLACK", text: "test", pick: 1 }],
    discardPile: [],
    players: new Map([
      ["p1", { gamePlayerId: "p1", userId: "u1", username: "a", playerOrder: 0, score: 0, hand: [mockCard] }],
      ["p2", { gamePlayerId: "p2", userId: "u2", username: "b", playerOrder: 1, score: 0, hand: [mockCard] }],
      ["p3", { gamePlayerId: "p3", userId: "u3", username: "c", playerOrder: 2, score: 0, hand: [mockCard] }],
    ]),
    gamePlayerOrder: ["p1", "p2", "p3"],
    currentRound: null,
    winnerReveal: null,
    winningScore: 5,
    maxRounds: 3,
    gameMode: "czar_is_dead",
    selectedPackIds: null,
    blankCardsEnabled: false,
    nextBlankId: -1,
    timedRoundsEnabled: false,
    nextWinnerCzarEnabled: false,
    roundTimeoutSeconds: 60,
    modeState: { modeName: "czar_is_dead" },
    modeConfig: {},
    ...overrides,
  };
}

const strategy = new CzarIsDeadStrategy();

describe("CzarIsDeadStrategy", () => {
  it("modeName is czar_is_dead", () => {
    expect(strategy.modeName).toBe("czar_is_dead");
  });

  it("getActivePlayerIds returns all players", () => {
    const state = makeMockState();
    expect(strategy.getActivePlayerIds(state)).toEqual(["p1", "p2", "p3"]);
  });

  it("getJudgePlayerId returns null", () => {
    expect(strategy.getJudgePlayerId()).toBeNull();
  });

  it("getVoterIds returns all players", () => {
    const state = makeMockState();
    const round = { number: 1, status: "PLAYING" as const, submissions: {} } as GameRoundState;
    expect(strategy.getVoterIds(state, round)).toEqual(["p1", "p2", "p3"]);
  });

  it("getExpectedSubmissionCount returns players.size", () => {
    const state = makeMockState();
    expect(strategy.getExpectedSubmissionCount(state)).toBe(3);
  });

  it("onBeforeReveal sets status to VOTING", () => {
    const round = { status: "PLAYING" as const } as GameRoundState;
    strategy.onBeforeReveal(makeMockState(), round);
    expect(round.status).toBe("VOTING");
  });

  describe("resolveVoteRound", () => {
    it("returns winner when one candidate has most votes", () => {
      const result = strategy.resolveVoteRound(makeMockState(), { p1: 3, p2: 1, p3: 0 });
      expect(result).toEqual({ type: "normal", winnerGpId: "p1", pointsAwarded: 1 });
    });

    it("returns no_winner on tie", () => {
      const result = strategy.resolveVoteRound(makeMockState(), { p1: 2, p2: 2, p3: 0 });
      expect(result).toEqual({ type: "no_winner", pointsAwarded: 0 });
    });

    it("returns no_winner on empty tally", () => {
      const result = strategy.resolveVoteRound(makeMockState(), {});
      expect(result).toEqual({ type: "no_winner", pointsAwarded: 0 });
    });

    it("returns winner with single submission", () => {
      const result = strategy.resolveVoteRound(makeMockState(), { p1: 3 });
      expect(result).toEqual({ type: "normal", winnerGpId: "p1", pointsAwarded: 1 });
    });
  });

  describe("buildWinnerReveal", () => {
    it("builds reveal for normal winner", () => {
      const mockCard: Card = { id: 2, type: "BLACK", text: "test", pick: 1 };
      const state = makeMockState({
        currentRound: { number: 1, blackCard: mockCard, submissions: { p1: { gamePlayerId: "p1", cards: [], submittedAt: new Date() } } } as any,
      });
      const result = strategy.buildWinnerReveal(state, { type: "normal", winnerGpId: "p1", pointsAwarded: 1 }, "p2");
      expect(result).not.toBeNull();
      expect(result!.winnerGamePlayerId).toBe("p1");
      expect(result!.winnerUsername).toBe("a");
      expect(result!.pointsAwarded).toBe(1);
    });

    it("builds reveal for tie (no_winner)", () => {
      const state = makeMockState();
      const result = strategy.buildWinnerReveal(state, { type: "no_winner", pointsAwarded: 0 }, "p2");
      expect(result).not.toBeNull();
      expect(result!.winnerGamePlayerId).toBe("tie");
      expect(result!.pointsAwarded).toBe(0);
      expect(result!.isFinalRound).toBe(false);
    });
  });

  it("determineNextJudge rotates round-robin", () => {
    const state = makeMockState();
    expect(strategy.determineNextJudge(state, "p1")).toBe("p2");
    expect(strategy.determineNextJudge(state, "p2")).toBe("p3");
    expect(strategy.determineNextJudge(state, "p3")).toBe("p1");
  });
});
