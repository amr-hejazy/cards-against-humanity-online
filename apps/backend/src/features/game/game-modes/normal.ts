import { AUTO_ADVANCE_MS } from "@cah/shared";
import { GameModeStrategy } from "./GameModeStrategy";
import type { GameState, RoundResult, WinnerRevealState } from "../game.types";

/** Standard CAH rules: non-judge players submit, judge picks a winner, 1 point awarded */
export class NormalStrategy extends GameModeStrategy {
  readonly modeName = "normal" as const;

  getExpectedSubmissionCount(state: GameState): number {
    return state.players.size - 1;
  }

  resolveRound(_state: GameState, input: { winnerGpId?: string }): RoundResult {
    return { type: "normal", winnerGpId: input.winnerGpId!, pointsAwarded: 1 };
  }

  buildWinnerReveal(state: GameState, result: RoundResult, previousJudgeGpId: string): WinnerRevealState | null {
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
      submissionDetails: this.buildSubmissionDetails(state, result.winnerGpId),
    };
  }
}
