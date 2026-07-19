import { AppError, ErrorTypes } from "../../../core/error/errors";
import type { Card } from "@cah/shared";
import type { GameState, GameRoundState, GamePlayerState, RoundResult, GameEndCheck, WinnerRevealState, GameModeState } from "../game.types";

/**
 * Abstract strategy for a game mode. Each mode (Normal, Rando Cardrissian, etc.)
 * extends this class and overrides hooks to alter game behavior without touching
 * the core service or socket layer.
 *
 * Hook lifecycle (per round):
 *   onRoundStart → validateSubmit → onBeforeReveal → resolveRound → buildWinnerReveal → checkGameEnd → determineNextJudge
 */
export abstract class GameModeStrategy {
  abstract readonly modeName: GameModeState["modeName"];

  shouldLoadWhiteCards(): boolean {
    return true;
  }

  getActivePlayerIds(state: GameState): string[] {
    return Array.from(state.players.keys());
  }

  getJudgePlayerId(state: GameState): string | null {
    return state.currentRound?.judgeGamePlayerId ?? null;
  }

  getVoterIds(_state: GameState, _round: GameRoundState): string[] {
    return [];
  }

  onRoundStart(_state: GameState, _round: GameRoundState): void {
    // no-op by default
  }

  protected dealBlankCardsToPlayer(state: GameState, player: GamePlayerState, count: number): void {
    for (let i = 0; i < count; i++) {
      const blankId = state.nextBlankId--;
      player.hand.push({
        id: blankId,
        type: "WHITE",
        text: "",
        pick: null,
        isBlank: true,
      });
    }
  }

  onBeforeReveal(_state: GameState, _round: GameRoundState): void {
    // no-op by default
  }

  abstract getExpectedSubmissionCount(state: GameState): number;

  /**
   * Validates a card submission. All modes share this basic validation:
   * round must be PLAYING, player must exist and not be judge, card count must
   * match the black card's pick, no duplicate cards or submissions, cards must
   * be in the player's hand, and blank cards must have custom text.
   */
  validateSubmit(
    state: GameState,
    gamePlayerId: string,
    submittedCardIds: number[],
    customTexts?: Record<string, string>,
  ): void {
    const currentRound = state.currentRound!;

    // 1. Validate round is in PLAYING status
    if (currentRound.status !== "PLAYING") {
      throw new AppError(400, "Cannot submit cards when the round is not in PLAYING status", ErrorTypes.ROUND_NOT_PLAYING);
    }

    // 2. Validate the player exists in the game
    const player = state.players.get(gamePlayerId);
    if (!player) {
      throw new AppError(404, "Player not found in the game", ErrorTypes.PLAYER_NOT_FOUND);
    }

    // 3. Ensure the player isn't the judge
    const judgeId = this.getJudgePlayerId(state);
    if (judgeId !== null && judgeId === gamePlayerId) {
      throw new AppError(400, "Judge cannot submit cards", ErrorTypes.JUDGE_CANNOT_SUBMIT);
    }

    // 4. Validate card count matches black card's pick value
    const blackCardPick = currentRound.blackCard.pick;
    if (blackCardPick === null) {
      throw new AppError(400, "Black card pick value is not defined", ErrorTypes.INVALID_BLACK_CARD);
    }

    if (submittedCardIds.length !== blackCardPick) {
      throw new AppError(400, `You must submit exactly ${blackCardPick} card(s) for this black card`, ErrorTypes.INVALID_SUBMISSION);
    }

    // 5. Prevent duplicate submissions
    if (currentRound.submissions[gamePlayerId]) {
      throw new AppError(400, "Player has already submitted", ErrorTypes.INVALID_SUBMISSION);
    }

    // 6. Prevent duplicate cards in the submission
    if (new Set(submittedCardIds).size !== submittedCardIds.length) {
      throw new AppError(400, "Duplicate cards submitted", ErrorTypes.INVALID_SUBMISSION);
    }

    // 7. Ensure every submitted card is in the player's hand
    for (const cardId of submittedCardIds) {
      if (!player.hand.some((card) => card.id === cardId)) {
        throw new AppError(400, `Card ID ${cardId} is not in the player's hand`, ErrorTypes.INVALID_SUBMISSION);
      }
    }

    // 8. If blank cards in submission, validate customTexts
    const blankIds = submittedCardIds.filter((id) => id < 0);
    for (const blankId of blankIds) {
      if (!state.blankCardsEnabled) {
        throw new AppError(400, "Blank cards are not enabled in this lobby", ErrorTypes.VALIDATION_ERROR);
      }
      const text = customTexts?.[blankId.toString()];
      if (!text || text.trim().length === 0) {
        throw new AppError(400, "Blank card must have custom text", ErrorTypes.VALIDATION_ERROR);
      }
    }
  }

  abstract resolveRound(state: GameState, input: { winnerGpId?: string }): RoundResult;

  resolveVoteRound(_state: GameState, _tallies: Record<string, number>): RoundResult {
    throw new AppError(400, "This game mode does not support voting", ErrorTypes.VALIDATION_ERROR);
  }

  /**
   * Checks whether the game should end. Triggers on:
   * - A player reaching the winning score
   * - Reaching max rounds (may end in a tie)
   */
  checkGameEnd(state: GameState, result: RoundResult): GameEndCheck {
    if (result.type === "normal" && result.winnerGpId) {
      const winner = state.players.get(result.winnerGpId);
      if (winner && winner.score >= state.winningScore) {
        return { ended: true, winnerGpId: result.winnerGpId, reason: "winning_score_reached" };
      }
    }

    if (state.currentRound && state.currentRound.number >= state.maxRounds) {
      let highestScore = 0;
      for (const p of state.players.values()) {
        if (p.score > highestScore) highestScore = p.score;
      }
      const tied = state.gamePlayerOrder.filter((id) => state.players.get(id)!.score === highestScore);
      if (tied.length === 1) {
        return { ended: true, winnerGpId: tied[0], reason: "max_rounds_reached" };
      }
      return { ended: true, winnerGpId: null, isTie: true, reason: "max_rounds_reached" };
    }

    return { ended: false };
  }

  abstract buildWinnerReveal(state: GameState, result: RoundResult, previousJudgeGpId: string): WinnerRevealState | null;

  /**
   * Rotates the judge for the next round. Honors the "Winner Becomes Czar"
   * house rule if enabled.
   */
  determineNextJudge(state: GameState, previousJudgeGpId: string): string {
    if (state.nextWinnerCzarEnabled && state.winnerReveal?.winnerGamePlayerId) {
      const winnerGpId = state.winnerReveal.winnerGamePlayerId;
      if (state.gamePlayerOrder.includes(winnerGpId)) {
        return winnerGpId;
      }
    }
    const currentJudgeIndex = state.gamePlayerOrder.indexOf(previousJudgeGpId);
    const nextJudgeIndex = (currentJudgeIndex + 1) % state.gamePlayerOrder.length;
    return state.gamePlayerOrder[nextJudgeIndex];
  }

  shouldAutoAdvance(_state: GameState): boolean {
    return true;
  }

  protected buildSubmissionDetails(
    state: GameState,
    winnerGpId?: string,
  ): { gamePlayerId: string; username: string; cards: Card[] }[] {
    if (!state.currentRound) return [];
    return Object.entries(state.currentRound.submissions)
      .filter(([id]) => !winnerGpId || id !== winnerGpId)
      .map(([id, sub]) => {
        const p = state.players.get(id);
        return {
          gamePlayerId: id,
          username: p?.username ?? "Unknown",
          cards: sub.cards,
        };
      });
  }
}
