import { describe, it, expect } from "vitest";
import { BlankOnlyStrategy } from "../../../../src/features/game/game-modes/blank-only";
import type { GameState, GameRoundState } from "../../../../src/features/game/game.types";
import type { Card } from "@cah/shared";

function makeMockState(overrides: Partial<GameState> = {}, votingStyle: "czar_votes" | "all_votes" = "czar_votes"): GameState {
  const mockCard: Card = { id: 1, type: "WHITE", text: "test", pick: null };
  const blankCard: Card = { id: -1, type: "WHITE", text: "", pick: null, isBlank: true, customText: "user text" };
  return {
    gameId: "game1",
    lobbyId: "lobby1",
    roomCode: "ABC123",
    whiteDeck: [mockCard],
    blackDeck: [{ id: 2, type: "BLACK", text: "_____ is better", pick: 1 }],
    discardPile: [],
    players: new Map([
      ["p1", { gamePlayerId: "p1", userId: "u1", username: "a", playerOrder: 0, score: 0, hand: [blankCard] }],
      ["p2", { gamePlayerId: "p2", userId: "u2", username: "b", playerOrder: 1, score: 0, hand: [blankCard] }],
      ["p3", { gamePlayerId: "p3", userId: "u3", username: "c", playerOrder: 2, score: 0, hand: [blankCard] }],
    ]),
    gamePlayerOrder: ["p1", "p2", "p3"],
    currentRound: null,
    winnerReveal: null,
    winningScore: 5,
    maxRounds: 3,
    gameMode: "blank_only",
    selectedPackIds: null,
    blankCardsEnabled: false,
    nextBlankId: -10,
    timedRoundsEnabled: false,
    nextWinnerCzarEnabled: false,
    roundTimeoutSeconds: 60,
    modeState: { modeName: "blank_only", votingStyle },
    modeConfig: { votingStyle },
    ...overrides,
  };
}

const strategy = new BlankOnlyStrategy();

describe("BlankOnlyStrategy (czar_votes)", () => {
  it("modeName is blank_only", () => {
    expect(strategy.modeName).toBe("blank_only");
  });

  it("shouldLoadWhiteCards returns false", () => {
    expect(strategy.shouldLoadWhiteCards()).toBe(false);
  });

  it("getActivePlayerIds returns all players", () => {
    const state = makeMockState();
    expect(strategy.getActivePlayerIds(state)).toEqual(["p1", "p2", "p3"]);
  });

  it("getJudgePlayerId returns judge from round", () => {
    const state = makeMockState({ currentRound: { judgeGamePlayerId: "p1" } as GameRoundState });
    expect(strategy.getJudgePlayerId(state)).toBe("p1");
  });

  it("getVoterIds returns empty array", () => {
    const state = makeMockState();
    const round = { number: 1, status: "PLAYING" as const, submissions: {} } as GameRoundState;
    expect(strategy.getVoterIds(state, round)).toEqual([]);
  });

  it("getExpectedSubmissionCount returns players.size - 1", () => {
    const state = makeMockState();
    expect(strategy.getExpectedSubmissionCount(state)).toBe(2);
  });

  it("validateSubmit rejects non-blank cards", () => {
    const state = makeMockState({
      currentRound: { id: "r1", number: 1, judgeGamePlayerId: "p1", blackCard: { id: 10, type: "BLACK", text: "test", pick: 1 }, submissions: {}, status: "PLAYING" } as GameRoundState,
    });
    const player = state.players.get("p2")!;
    player.hand.push({ id: 999, type: "WHITE", text: "real card", pick: null });
    expect(() => strategy.validateSubmit(state, "p2", [999])).toThrow("Only blank cards");
  });

  it("validateSubmit accepts blank cards with text", () => {
    const state = makeMockState({
      currentRound: { id: "r1", number: 1, judgeGamePlayerId: "p1", blackCard: { id: 10, type: "BLACK", text: "test", pick: 1 }, submissions: {}, status: "PLAYING" } as GameRoundState,
    });
    expect(() => strategy.validateSubmit(state, "p2", [-1], { "-1": "my answer" })).not.toThrow();
  });

  it("onRoundStart deals pick blanks to non-judge players", () => {
    const state = makeMockState({
      currentRound: {
        id: "r1", number: 1, judgeGamePlayerId: "p1",
        blackCard: { id: 10, type: "BLACK", text: "_____ is better", pick: 2 },
        submissions: {}, status: "PLAYING",
      } as GameRoundState,
    });
    strategy.onRoundStart(state, state.currentRound!);
    expect(state.players.get("p1")!.hand).toEqual([]);
    expect(state.players.get("p2")!.hand.length).toBe(2);
    expect(state.players.get("p3")!.hand.length).toBe(2);
    for (const card of state.players.get("p2")!.hand) {
      expect(card.isBlank).toBe(true);
    }
  });

  it("onBeforeReveal does not change status", () => {
    const round = { status: "PLAYING" as const } as GameRoundState;
    strategy.onBeforeReveal(makeMockState(), round);
    expect(round.status).toBe("PLAYING");
  });

  it("resolveRound returns normal result", () => {
    const result = strategy.resolveRound(makeMockState(), { winnerGpId: "p2" });
    expect(result).toEqual({ type: "normal", winnerGpId: "p2", pointsAwarded: 1 });
  });

  it("buildWinnerReveal builds standard reveal", () => {
    const state = makeMockState({
      currentRound: { number: 1, blackCard: { id: 10, type: "BLACK", text: "test", pick: 1 }, submissions: { p1: { gamePlayerId: "p1", cards: [], submittedAt: new Date() } } } as any,
    });
    const result = strategy.buildWinnerReveal(state, { type: "normal", winnerGpId: "p1", pointsAwarded: 1 }, "p2");
    expect(result).not.toBeNull();
    expect(result!.winnerGamePlayerId).toBe("p1");
    expect(result!.winnerUsername).toBe("a");
    expect(result!.pointsAwarded).toBe(1);
  });

  it("shouldAutoAdvance returns true", () => {
    expect(strategy.shouldAutoAdvance(makeMockState())).toBe(true);
  });
});

describe("BlankOnlyStrategy (all_votes)", () => {
  function makeAllVotesState(overrides: Partial<GameState> = {}): GameState {
    return makeMockState(overrides, "all_votes");
  }

  it("getJudgePlayerId returns null", () => {
    const state = makeAllVotesState();
    expect(strategy.getJudgePlayerId(state)).toBeNull();
  });

  it("getVoterIds returns all players", () => {
    const state = makeAllVotesState();
    const round = { number: 1, status: "PLAYING" as const, submissions: {} } as GameRoundState;
    expect(strategy.getVoterIds(state, round)).toEqual(["p1", "p2", "p3"]);
  });

  it("getExpectedSubmissionCount returns players.size", () => {
    const state = makeAllVotesState();
    expect(strategy.getExpectedSubmissionCount(state)).toBe(3);
  });

  it("onRoundStart deals blanks to all players", () => {
    const state = makeAllVotesState({
      currentRound: {
        id: "r1", number: 1, judgeGamePlayerId: "p1",
        blackCard: { id: 10, type: "BLACK", text: "_____ is better", pick: 1 },
        submissions: {}, status: "PLAYING",
      } as GameRoundState,
    });
    strategy.onRoundStart(state, state.currentRound!);
    expect(state.players.get("p1")!.hand.length).toBe(1);
    expect(state.players.get("p2")!.hand.length).toBe(1);
    expect(state.players.get("p3")!.hand.length).toBe(1);
    for (const [, player] of state.players) {
      for (const card of player.hand) {
        expect(card.isBlank).toBe(true);
      }
    }
  });

  it("onBeforeReveal sets status to VOTING", () => {
    const round = { status: "PLAYING" as const } as GameRoundState;
    strategy.onBeforeReveal(makeAllVotesState(), round);
    expect(round.status).toBe("VOTING");
  });

  it("resolveRound throws", () => {
    expect(() => strategy.resolveRound(makeAllVotesState(), {})).toThrow("resolveVoteRound");
  });

  describe("resolveVoteRound", () => {
    it("returns winner when one candidate has most votes", () => {
      const result = strategy.resolveVoteRound(makeAllVotesState(), { p1: 3, p2: 1, p3: 0 });
      expect(result).toEqual({ type: "normal", winnerGpId: "p1", pointsAwarded: 1 });
    });

    it("returns no_winner on tie", () => {
      const result = strategy.resolveVoteRound(makeAllVotesState(), { p1: 2, p2: 2 });
      expect(result).toEqual({ type: "no_winner", pointsAwarded: 0 });
    });

    it("returns no_winner on empty tally", () => {
      const result = strategy.resolveVoteRound(makeAllVotesState(), {});
      expect(result).toEqual({ type: "no_winner", pointsAwarded: 0 });
    });
  });

  it("buildWinnerReveal builds reveal with votes for normal winner", () => {
    const state = makeAllVotesState({
      currentRound: { number: 1, blackCard: { id: 10, type: "BLACK", text: "test", pick: 1 }, submissions: { p1: { gamePlayerId: "p1", cards: [], submittedAt: new Date() } } } as any,
    });
    const result = strategy.buildWinnerReveal(state, { type: "normal", winnerGpId: "p1", pointsAwarded: 1 }, "p2");
    expect(result).not.toBeNull();
    expect(result!.winnerGamePlayerId).toBe("p1");
    expect(result!.pointsAwarded).toBe(1);
  });

  it("buildWinnerReveal builds tie reveal", () => {
    const state = makeAllVotesState();
    const result = strategy.buildWinnerReveal(state, { type: "no_winner", pointsAwarded: 0 }, "p2");
    expect(result).not.toBeNull();
    expect(result!.winnerGamePlayerId).toBe("tie");
    expect(result!.pointsAwarded).toBe(0);
  });

  it("determineNextJudge rotates round-robin", () => {
    const state = makeAllVotesState();
    expect(strategy.determineNextJudge(state, "p1")).toBe("p2");
    expect(strategy.determineNextJudge(state, "p2")).toBe("p3");
    expect(strategy.determineNextJudge(state, "p3")).toBe("p1");
  });
});
