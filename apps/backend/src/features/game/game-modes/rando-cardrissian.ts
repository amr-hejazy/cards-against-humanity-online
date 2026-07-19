import { GameModeStrategy } from "./GameModeStrategy";
import type { GameState, GameRoundState, RoundResult, WinnerRevealState } from "../game.types";
import { AUTO_ADVANCE_MS, type Card } from "@cah/shared";

/**
 * Rando Cardrissian mode: an extra submission drawn from the white deck is
 * injected when the round transitions to REVEAL. The judge sees it alongside
 * real submissions (no badge — they pick blind). If the judge picks rando,
 * no points are awarded and the round auto-advances.
 */
export class RandoCardrissianStrategy extends GameModeStrategy {
  readonly modeName = "rando_cardrissian" as const;

  /** Draw cards from whiteDeck and inject as an anonymous submission */
  onBeforeReveal(state: GameState, round: GameRoundState): void {
    const pick = round.blackCard.pick ?? 1;
    if (state.whiteDeck.length < pick) return;
    const cards: Card[] = [];
    for (let i = 0; i < pick; i++) {
      const card = state.whiteDeck.pop();
      if (card) cards.push(card);
    }
    round.submissions["rando"] = {
      gamePlayerId: "rando",
      cards,
      submittedAt: new Date(),
    };
  }

  /** Only non-judge players submit; rando is injected via onBeforeReveal */
  getExpectedSubmissionCount(state: GameState): number {
    return state.players.size - 1;
  }

  /** If judge picks rando, return no_winner (no points awarded) */
  resolveRound(_state: GameState, input: { winnerGpId?: string }): RoundResult {
    if (input.winnerGpId === "rando") {
      return { type: "no_winner", pointsAwarded: 0 };
    }
    return { type: "normal", winnerGpId: input.winnerGpId!, pointsAwarded: 1 };
  }

  /**
   * Builds the winner-reveal state. For no_winner (rando picked), returns a
   * reveal with 0 points and isFinalRound=false so the round auto-advances.
   * For normal wins, delegates to base checkGameEnd for final-round detection.
   */
  buildWinnerReveal(state: GameState, result: RoundResult, previousJudgeGpId: string): WinnerRevealState | null {
    if (result.type === "no_winner") {
      const winningCards = state.currentRound?.submissions["rando"]?.cards ?? [];
      return {
        winnerGamePlayerId: "rando",
        previousJudgeGamePlayerId: previousJudgeGpId,
        winnerUsername: "Rando Cardrissian",
        pointsAwarded: 0,
        autoAdvanceAt: new Date(Date.now() + AUTO_ADVANCE_MS),
        nextRoundNumber: (state.currentRound?.number ?? 0) + 1,
        winningCards,
        blackCard: state.currentRound?.blackCard ?? { id: 0, type: "BLACK", text: "", pick: 0 },
        isFinalRound: false,
      };
    }
    if (result.type !== "normal" || !result.winnerGpId) return null;

    const winner = state.players.get(result.winnerGpId);
    if (!winner) return null;

    const endCheck = this.checkGameEnd(state, result);
    let gameWinnerId: string | null = null;
    let endReason: "winning_score_reached" | "max_rounds_reached" | undefined;
    if (endCheck.ended) {
      gameWinnerId = endCheck.winnerGpId ?? null;
      endReason = endCheck.reason as "winning_score_reached" | "max_rounds_reached";
    }

    const winningCards = state.currentRound?.submissions[result.winnerGpId]?.cards ?? [];

    return {
      winnerGamePlayerId: result.winnerGpId,
      previousJudgeGamePlayerId: previousJudgeGpId,
      winnerUsername: winner.username,
      pointsAwarded: result.pointsAwarded,
      autoAdvanceAt: new Date(Date.now() + AUTO_ADVANCE_MS),
      nextRoundNumber: (state.currentRound?.number ?? 0) + 1,
      winningCards,
      blackCard: state.currentRound?.blackCard ?? { id: 0, type: "BLACK", text: "", pick: 0 },
      isFinalRound: endCheck.ended,
      gameWinnerId,
      endReason,
    };
  }
}
