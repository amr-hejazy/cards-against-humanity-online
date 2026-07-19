import { describe, it, expect } from "vitest";
import { RandoCardrissianStrategy } from "../../../../src/features/game/game-modes/rando-cardrissian";
import { createMockGameState } from "./test-helpers";

describe("RandoCardrissianStrategy", () => {
  const strategy = new RandoCardrissianStrategy();

  it("returns rando_cardrissian mode name", () => {
    expect(strategy.modeName).toBe("rando_cardrissian");
  });

  it("onBeforeReveal injects rando submission drawn from whiteDeck", () => {
    const state = createMockGameState(3);
    strategy.onBeforeReveal(state, state.currentRound!);
    expect(state.currentRound!.submissions["rando"]).toBeDefined();
    expect(state.currentRound!.submissions["rando"].gamePlayerId).toBe("rando");
    expect(state.currentRound!.submissions["rando"].cards).toHaveLength(2);
    expect(state.whiteDeck.length).toBe(1);
  });

  it("onBeforeReveal does not inject when whiteDeck insufficient", () => {
    const state = createMockGameState(3, { whiteDeck: [] });
    strategy.onBeforeReveal(state, state.currentRound!);
    expect(state.currentRound!.submissions["rando"]).toBeUndefined();
  });

  it("expected submission count equals non-judge player count", () => {
    const state = createMockGameState(3);
    expect(strategy.getExpectedSubmissionCount(state)).toBe(2);
  });

  it("resolveRound returns no_winner when rando is picked", () => {
    const state = createMockGameState(3);
    const result = strategy.resolveRound(state, { winnerGpId: "rando" });
    expect(result).toEqual({ type: "no_winner", pointsAwarded: 0 });
  });

  it("resolveRound returns normal when player wins", () => {
    const state = createMockGameState(3);
    const result = strategy.resolveRound(state, { winnerGpId: "gp-1" });
    expect(result).toEqual({ type: "normal", winnerGpId: "gp-1", pointsAwarded: 1 });
  });

  it("buildWinnerReveal returns reveal for no_winner with rando as winner", () => {
    const state = createMockGameState(3);
    state.currentRound!.submissions["rando"] = {
      gamePlayerId: "rando",
      cards: [{ id: 99, type: "WHITE", text: "rando card", pick: null }],
      submittedAt: new Date(),
    };
    const result = strategy.resolveRound(state, { winnerGpId: "rando" });
    const reveal = strategy.buildWinnerReveal(state, result, "gp-0");
    expect(reveal).not.toBeNull();
    expect(reveal!.winnerGamePlayerId).toBe("rando");
    expect(reveal!.winnerUsername).toBe("Rando Cardrissian");
    expect(reveal!.pointsAwarded).toBe(0);
    expect(reveal!.isFinalRound).toBe(false);
  });

  it("buildWinnerReveal builds reveal for normal win", () => {
    const state = createMockGameState(3);
    state.players.get("gp-1")!.score = 4;
    const result = strategy.resolveRound(state, { winnerGpId: "gp-1" });
    const reveal = strategy.buildWinnerReveal(state, result, "gp-0");
    expect(reveal).not.toBeNull();
    expect(reveal!.winnerGamePlayerId).toBe("gp-1");
    expect(reveal!.winnerUsername).toBe("Player 1");
    expect(reveal!.pointsAwarded).toBe(1);
  });

  it("checkGameEnd delegates to base class logic", () => {
    const state = createMockGameState(3);
    let result = strategy.resolveRound(state, { winnerGpId: "gp-1" });
    let check = strategy.checkGameEnd(state, result);
    expect(check.ended).toBe(false);

    state.players.get("gp-1")!.score = 5;
    check = strategy.checkGameEnd(state, result);
    expect(check.ended).toBe(true);
    expect(check.reason).toBe("winning_score_reached");
  });
});
