import type { Server } from "socket.io";
import { randomInt } from "node:crypto";
import { BOT_AUTO_ADVANCE_MS } from "@cah/shared";
import { getGameState, withGameLock } from "./game.state";
import {
  submitCards,
  judgeSubmission,
  endGame,
  startNextRound,
  resolveVoteRound,
} from "./game.service";
import {
  emitPlayerGameStates,
  endGameCleanup,
  scheduleAutoAdvance,
} from "../../socket/game.socket.helpers";
import {
  clearAutoAdvanceTimeout,
  setAutoAdvanceTimeout,
} from "../../core/game/game-maps";
import {
  setVote,
  getVoteCount,
  getVoterSet,
} from "../../core/game/vote-maps";
import { getStrategy } from "./game-modes";
import type { GameState } from "./game.types";
import { shuffle } from "../../utils/shuffle";
import logger from "../../core/logger";

const botTimeouts = new Map<string, NodeJS.Timeout>();

function pickBotCards(state: GameState, botGpId: string): number[] {
  const bot = state.players.get(botGpId);
  if (!bot) return [];
  const pickCount = state.currentRound?.blackCard.pick ?? 1;
  const shuffled = shuffle([...bot.hand]);
  return shuffled.slice(0, pickCount).map((c) => c.id);
}

function pickBotWinner(state: GameState): string {
  const subs = Object.keys(state.currentRound?.submissions ?? {});
  return subs[randomInt(subs.length)];
}

export function scheduleBotActions(
  gameId: string,
  io: Server,
  gamePlayerSockets: Map<string, Set<string>>,
  socketIdToGamePlayerId: Map<string, string>,
): void {
  cancelBotActions(gameId);

  let state: GameState;
  try {
    state = getGameState(gameId);
  } catch {
    return;
  }
  if (!state.currentRound) return;

  if (state.currentRound.status === "PLAYING") {
    const judgeId = state.currentRound.judgeGamePlayerId;
    const botToSubmit = [...state.players.values()].find(
      (p) =>
        p.isBot &&
        p.gamePlayerId !== judgeId &&
        !state.currentRound!.submissions[p.gamePlayerId],
    );
    if (!botToSubmit) return;

    const timeout = setTimeout(async () => {
      botTimeouts.delete(gameId);
      try {
        const cards = pickBotCards(state, botToSubmit.gamePlayerId);
        const updated = await submitCards(
          gameId,
          botToSubmit.gamePlayerId,
          cards,
        );
        emitPlayerGameStates(io, updated, gamePlayerSockets);
        scheduleBotActions(
          gameId,
          io,
          gamePlayerSockets,
          socketIdToGamePlayerId,
        );
      } catch (err) {
        logger.warn("bot submitCards failed (state may be gone)", err);
      }
    }, 1000);
    botTimeouts.set(gameId, timeout);
    return;
  }

  if (state.currentRound.status === "VOTING") {
    const strategy = getStrategy(state.gameMode);
    const voterIds = strategy.getVoterIds(state, state.currentRound);
    const existingVoted = getVoterSet(gameId, state.currentRound.number);

    for (const voterGpId of voterIds) {
      const player = state.players.get(voterGpId);
      if (!player?.isBot) continue;
      if (existingVoted.has(voterGpId)) continue;

      const timeout = setTimeout(async () => {
        botTimeouts.delete(gameId);
        try {
          const subs = Object.keys(state.currentRound?.submissions ?? {}).filter(
            (id) => id !== voterGpId,
          );
          if (subs.length === 0) return;
          const chosen = subs[randomInt(subs.length)];

          setVote(gameId, state.currentRound!.number, voterGpId, chosen);

          const { submitted } = getVoteCount(
            gameId,
            state.currentRound!.number,
          );
          if (submitted >= voterIds.length) {
            await resolveVoteRound(gameId);
            const updatedState = getGameState(gameId);
            if (updatedState.currentRound || updatedState.winnerReveal) {
              emitPlayerGameStates(io, updatedState, gamePlayerSockets);
            }
          }
        } catch (err) {
          logger.warn("bot vote error", err);
        }
      }, 1000);
      botTimeouts.set(gameId, timeout);
    }
    return;
  }

  if (state.currentRound.status === "REVEAL") {
    const judgeId = state.currentRound.judgeGamePlayerId;
    const judge = state.players.get(judgeId);
    if (!judge?.isBot) return;

    const timeout = setTimeout(async () => {
      botTimeouts.delete(gameId);
      try {
        const chosen = pickBotWinner(state);
        const result = await judgeSubmission(gameId, judgeId, chosen);
        if (result.type === "GAME_ENDED") {
          await endGameCleanup(
            io,
            gameId,
            result.results,
            gamePlayerSockets,
            socketIdToGamePlayerId,
          );
        } else {
          // Shorten auto-advance timer when bot is czar (8s instead of 15s)
          result.state.winnerReveal!.autoAdvanceAt = new Date(
            Date.now() + BOT_AUTO_ADVANCE_MS,
          );
          emitPlayerGameStates(io, result.state, gamePlayerSockets);
          clearAutoAdvanceTimeout(gameId);
          scheduleAutoAdvance(gameId, io, gamePlayerSockets, socketIdToGamePlayerId, scheduleBotActions, BOT_AUTO_ADVANCE_MS);
        }
      } catch (err) {
        logger.warn("bot judgeSubmission failed (state may be gone)", err);
      }
    }, 1000);
    botTimeouts.set(gameId, timeout);
  }
}

export function cancelBotActions(gameId: string): void {
  const existing = botTimeouts.get(gameId);
  if (existing) {
    clearTimeout(existing);
    botTimeouts.delete(gameId);
  }
}
