import { AUTO_ADVANCE_MS, type Card } from "@cah/shared";
import { GameModeStrategy } from "./GameModeStrategy";
import { getVoteRecords } from "../../../core/game/vote-maps";
import type { GameState, GameRoundState, RoundResult, WinnerRevealState, GamePlayerState } from "../game.types";

export class CzarIsDeadStrategy extends GameModeStrategy {
  readonly modeName = "czar_is_dead" as const;

  getJudgePlayerId(): string | null {
    return null;
  }

  getVoterIds(state: GameState, _round: GameRoundState): string[] {
    return Array.from(state.players.keys());
  }

  getExpectedSubmissionCount(state: GameState): number {
    return state.players.size;
  }

  onBeforeReveal(_state: GameState, round: GameRoundState): void {
    round.status = "VOTING";
  }

  resolveRound(): RoundResult {
    throw new Error("CzarIsDead mode does not use judge pick — use resolveVoteRound instead");
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

  determineNextJudge(state: GameState, previousJudgeGpId: string): string {
    const idx = state.gamePlayerOrder.indexOf(previousJudgeGpId);
    return state.gamePlayerOrder[(idx + 1) % state.gamePlayerOrder.length];
  }
}
