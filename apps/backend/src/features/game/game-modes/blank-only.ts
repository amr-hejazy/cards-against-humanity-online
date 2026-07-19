import { AUTO_ADVANCE_MS } from "@cah/shared";
import type { Card } from "@cah/shared";
import { GameModeStrategy } from "./GameModeStrategy";
import { AppError, ErrorTypes } from "../../../core/error/errors";
import { getVoteRecords } from "../../../core/game/vote-maps";
import type { GameState, GameRoundState, RoundResult, WinnerRevealState, GamePlayerState } from "../game.types";

function getVotingStyle(state: GameState): "czar_votes" | "all_votes" {
  return (state.modeConfig?.votingStyle as "czar_votes" | "all_votes") ?? "czar_votes";
}

function isAllVotes(state: GameState): boolean {
  return getVotingStyle(state) === "all_votes";
}

export class BlankOnlyStrategy extends GameModeStrategy {
  readonly modeName = "blank_only" as const;

  shouldLoadWhiteCards(): boolean {
    return false;
  }

  getJudgePlayerId(state: GameState): string | null {
    if (isAllVotes(state)) return null;
    return state.currentRound?.judgeGamePlayerId ?? null;
  }

  getVoterIds(state: GameState, _round: GameRoundState): string[] {
    if (isAllVotes(state)) return Array.from(state.players.keys());
    return [];
  }

  getExpectedSubmissionCount(state: GameState): number {
    if (isAllVotes(state)) return state.players.size;
    return state.players.size - 1;
  }

  validateSubmit(
    state: GameState,
    gamePlayerId: string,
    submittedCardIds: number[],
    customTexts?: Record<string, string>,
  ): void {
    const currentRound = state.currentRound;
    if (!currentRound) {
      throw new AppError(400, "No active round", ErrorTypes.ROUND_NOT_PLAYING);
    }
    if (currentRound.status !== "PLAYING") {
      throw new AppError(400, "Cannot submit cards when the round is not in PLAYING status", ErrorTypes.ROUND_NOT_PLAYING);
    }
    const player = state.players.get(gamePlayerId);
    if (!player) {
      throw new AppError(404, "Player not found in the game", ErrorTypes.PLAYER_NOT_FOUND);
    }
    const judgeId = this.getJudgePlayerId(state);
    if (judgeId !== null && judgeId === gamePlayerId) {
      throw new AppError(400, "Judge cannot submit cards", ErrorTypes.JUDGE_CANNOT_SUBMIT);
    }
    const blackCardPick = currentRound.blackCard.pick;
    if (blackCardPick === null) {
      throw new AppError(400, "Black card pick value is not defined", ErrorTypes.INVALID_BLACK_CARD);
    }
    if (submittedCardIds.length !== blackCardPick) {
      throw new AppError(400, `You must submit exactly ${blackCardPick} card(s) for this black card`, ErrorTypes.INVALID_SUBMISSION);
    }
    if (currentRound.submissions[gamePlayerId]) {
      throw new AppError(400, "Player has already submitted", ErrorTypes.INVALID_SUBMISSION);
    }
    if (new Set(submittedCardIds).size !== submittedCardIds.length) {
      throw new AppError(400, "Duplicate cards submitted", ErrorTypes.INVALID_SUBMISSION);
    }
    for (const cardId of submittedCardIds) {
      if (!player.hand.some((card) => card.id === cardId)) {
        throw new AppError(400, `Card ID ${cardId} is not in the player's hand`, ErrorTypes.INVALID_SUBMISSION);
      }
    }
    const blankIds = submittedCardIds.filter((id) => id < 0);
    for (const blankId of blankIds) {
      const text = customTexts?.[blankId.toString()];
      if (!text || text.trim().length === 0) {
        throw new AppError(400, "Blank card must have custom text", ErrorTypes.VALIDATION_ERROR);
      }
    }
    for (const cardId of submittedCardIds) {
      const card = player.hand.find((c) => c.id === cardId);
      if (card && !card.isBlank) {
        throw new Error("Only blank cards can be submitted in Blank Only mode");
      }
    }
  }

  onRoundStart(state: GameState, round: GameRoundState): void {
    const pick = round.blackCard.pick ?? 0;
    for (const player of state.players.values()) {
      player.hand = [];
      const shouldSubmit = isAllVotes(state) || player.gamePlayerId !== round.judgeGamePlayerId;
      if (shouldSubmit) {
        this.dealBlankCardsToPlayer(state, player, pick);
      }
    }
  }

  onBeforeReveal(_state: GameState, round: GameRoundState): void {
    if (isAllVotes(_state)) {
      round.status = "VOTING";
    }
  }

  resolveRound(_state: GameState, input: { winnerGpId?: string }): RoundResult {
    if (isAllVotes(_state)) {
      throw new Error("BlankOnly all_votes mode does not use judge pick — use resolveVoteRound instead");
    }
    return { type: "normal", winnerGpId: input.winnerGpId!, pointsAwarded: 1 };
  }

  resolveVoteRound(_state: GameState, tallies: Record<string, number>): RoundResult {
    const values = Object.values(tallies);
    if (values.length === 0) return { type: "no_winner", pointsAwarded: 0 };
    const maxVotes = Math.max(...values);
    const winners = Object.entries(tallies)
      .filter(([, v]) => v === maxVotes)
      .map(([k]) => k);
    if (winners.length === 1) {
      return { type: "normal", winnerGpId: winners[0], pointsAwarded: 1 };
    }
    return { type: "no_winner", pointsAwarded: 0 };
  }

  private enrichWithVotes(
    details: { gamePlayerId: string; username: string; cards: Card[] }[],
    voteRecords: Map<string, string>,
    players: Map<string, GamePlayerState>,
  ) {
    const voterMap = new Map<string, string[]>();
    for (const [voterGpId, chosenGpId] of voteRecords) {
      const voter = players.get(voterGpId);
      if (!voter) continue;
      const existing = voterMap.get(chosenGpId);
      if (existing) existing.push(voter.username);
      else voterMap.set(chosenGpId, [voter.username]);
    }
    return details.map((d) => {
      const voters = voterMap.get(d.gamePlayerId);
      return voters ? { ...d, votedBy: voters } : d;
    });
  }

  buildWinnerReveal(state: GameState, result: RoundResult, previousJudgeGpId: string): WinnerRevealState | null {
    if (isAllVotes(state)) {
      const voteRecords = getVoteRecords(state.gameId, state.currentRound?.number ?? 0);
      if (result.type === "no_winner") {
        return {
          winnerGamePlayerId: "tie",
          previousJudgeGamePlayerId: previousJudgeGpId,
          winnerUsername: "No one \u2014 tie vote!",
          pointsAwarded: 0,
          autoAdvanceAt: new Date(Date.now() + AUTO_ADVANCE_MS),
          nextRoundNumber: (state.currentRound?.number ?? 0) + 1,
          winningCards: [],
          blackCard: state.currentRound?.blackCard ?? { id: 0, type: "BLACK", text: "", pick: 0 },
          isFinalRound: false,
          submissionDetails: voteRecords
            ? this.enrichWithVotes(this.buildSubmissionDetails(state), voteRecords, state.players)
            : this.buildSubmissionDetails(state),
        };
      }
      if (result.type !== "normal" || !result.winnerGpId) return null;
      const winner = state.players.get(result.winnerGpId);
      if (!winner) return null;
      const endCheck = this.checkGameEnd(state, result);
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
        gameWinnerId: endCheck.ended ? (endCheck.winnerGpId ?? null) : undefined,
        endReason: endCheck.ended ? endCheck.reason as "winning_score_reached" | "max_rounds_reached" : undefined,
        submissionDetails: voteRecords
          ? this.enrichWithVotes(this.buildSubmissionDetails(state), voteRecords, state.players)
          : this.buildSubmissionDetails(state),
      };
    }
    if (result.type !== "normal" || !result.winnerGpId) return null;
    const winner = state.players.get(result.winnerGpId);
    if (!winner) return null;
    const endCheck = this.checkGameEnd(state, result);
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
      gameWinnerId: endCheck.ended ? (endCheck.winnerGpId ?? null) : undefined,
      endReason: endCheck.ended ? endCheck.reason as "winning_score_reached" | "max_rounds_reached" : undefined,
      submissionDetails: this.buildSubmissionDetails(state, result.winnerGpId),
    };
  }

  determineNextJudge(state: GameState, previousJudgeGpId: string): string {
    if (isAllVotes(state)) {
      const idx = state.gamePlayerOrder.indexOf(previousJudgeGpId);
      return state.gamePlayerOrder[(idx + 1) % state.gamePlayerOrder.length];
    }
    return super.determineNextJudge(state, previousJudgeGpId);
  }
}
