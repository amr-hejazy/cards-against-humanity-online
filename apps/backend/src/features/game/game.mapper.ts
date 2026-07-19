import type { Card, PlayerGameStateDto } from "@cah/shared";
import { GameState } from "./game.types";
import { AppError, ErrorTypes } from "../../core/error/errors";
import { shuffle } from "../../utils/shuffle";
import { getStrategy } from "./game-modes";
import { getVoterSet } from "../../core/game/vote-maps";

export const toPlayerGameStateDto = (
  state: GameState,
  gamePlayerId: string,
): PlayerGameStateDto => {
  const player = state.players.get(gamePlayerId);

  if (!player) {
    throw new AppError(
      404,
      "Player not found in this game",
      ErrorTypes.PLAYER_NOT_FOUND,
    );
  }

  const isJudge = state.currentRound?.judgeGamePlayerId === gamePlayerId;

  let submissions: { gamePlayerId: string; cards: Card[] }[] = [];
  if (state.currentRound) {
    const rawSubmissions = Object.values(state.currentRound.submissions);
    if (isJudge) {
      submissions = shuffle([...rawSubmissions]).map((sub) => ({
        gamePlayerId: sub.gamePlayerId,
        cards: sub.cards,
      }));
    } else {
      submissions = rawSubmissions.map((sub) => ({
        gamePlayerId: sub.gamePlayerId,
        cards: sub.cards,
      }));
    }
  }

  return {
    game: {
      gameId: state.gameId,

      players: Array.from(state.players.values()).map((p) => ({
        gamePlayerId: p.gamePlayerId,
        userId: p.userId,
        username: p.username,
        playerOrder: p.playerOrder,
        score: p.score,
        submitted: state.currentRound
          ? state.currentRound.submissions[p.gamePlayerId] !== undefined
          : false,
        isBot: p.isBot ?? false,
      })),

      currentRound: state.currentRound
        ? (() => {
            const strategy = getStrategy(state.gameMode);
            const voterIds = strategy.getVoterIds(state, state.currentRound);
            const isVoter = voterIds.includes(gamePlayerId);
            const votedSet = getVoterSet(state.gameId, state.currentRound.number);
            return {
              id: state.currentRound.id,
              number: state.currentRound.number,
              judgeGamePlayerId: state.currentRound.judgeGamePlayerId,
              blackCard: state.currentRound.blackCard,
              status: state.currentRound.status,
              submittedCount: Object.keys(state.currentRound.submissions).length,
              submissions,
              roundStartedAt: state.currentRound.roundStartedAt?.toISOString(),
              voteMode: voterIds.length > 0
                ? {
                    voteTargets: voterIds,
                    voterGamePlayerId: isVoter ? gamePlayerId : "",
                    hasVoted: isVoter ? votedSet.has(gamePlayerId) : false,
                  }
                : undefined,
            };
          })()
        : null,

      timedRoundsEnabled: state.timedRoundsEnabled,
      roundTimeoutSeconds: state.roundTimeoutSeconds,
      gameMode: state.gameMode,
      modeState: state.modeState,
      modeConfig: state.modeConfig,

      winnerReveal: state.winnerReveal
        ? {
            winnerGamePlayerId: state.winnerReveal.winnerGamePlayerId,
            previousJudgeGamePlayerId:
              state.winnerReveal.previousJudgeGamePlayerId,
            winnerUsername: state.winnerReveal.winnerUsername,
            pointsAwarded: state.winnerReveal.pointsAwarded,
            autoAdvanceAt: state.winnerReveal.autoAdvanceAt.toISOString(),
            winningCards: state.winnerReveal.winningCards,
            blackCard: state.winnerReveal.blackCard,
            isFinalRound: state.winnerReveal.isFinalRound,
            gameWinnerId: state.winnerReveal.gameWinnerId,
            endReason: state.winnerReveal.endReason,
            submissionDetails: state.winnerReveal.submissionDetails,
          }
        : null,
    },

    player: {
      hand: player.hand,
    },
  };
};
