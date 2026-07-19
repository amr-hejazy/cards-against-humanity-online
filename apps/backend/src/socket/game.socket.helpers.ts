import type { EndGameResults } from "@cah/shared";
import type { GameState } from "../features/game/game.types";
import type { Server } from "socket.io";
import { toPlayerGameStateDto } from "../features/game/game.mapper";
import { getGameState, withGameLock, findActiveGameByUserId, resolveGamePlayerId } from "../features/game/game.state";
import { setRoundTimer, clearRoundTimer, setAutoAdvanceTimeout } from "../core/game/game-maps";
import { startRevealPhase, startNextRound, endGame } from "../features/game/game.service";
import { getStrategy } from "../features/game/game-modes";
import { shuffle } from "../utils/shuffle";
import logger from "../core/logger";

type ScheduleBotActions = (
  gameId: string,
  io: Server,
  gamePlayerSockets: Map<string, Set<string>>,
  socketIdToGamePlayerId: Map<string, string>,
) => void;

/**
 * Sets a timeout for the current round. When it expires, auto-submits random
 * cards for any non-judge player who hasn't submitted yet, then transitions
 * to REVEAL via startRevealPhase (which calls onBeforeReveal for mode-specific
 * extras like rando submissions).
 */
export const setTimedRoundTimer = (
  gameId: string,
  io: Server,
  scheduleBotActions: ScheduleBotActions,
  gamePlayerSockets: Map<string, Set<string>>,
  socketIdToGamePlayerId: Map<string, string>,
): void => {
  let state: GameState;
  try {
    state = getGameState(gameId);
  } catch {
    return;
  }
  if (!state.timedRoundsEnabled || !state.currentRound || state.currentRound.status !== "PLAYING") return;

  const timeout = setTimeout(async () => {
    try {
      await withGameLock(gameId, async () => {
        const lockedState = getGameState(gameId);
        if (!lockedState?.currentRound || lockedState.currentRound.status !== "PLAYING") return;

        const judgeId = lockedState.currentRound.judgeGamePlayerId;
        const pickCount = lockedState.currentRound.blackCard.pick ?? 1;
        const submissions = lockedState.currentRound.submissions;

        for (const [gpId, player] of lockedState.players) {
          if (gpId === judgeId || submissions[gpId]) continue;
          const shuffled = shuffle(player.hand);
          submissions[gpId] = {
            gamePlayerId: gpId,
            cards: shuffled.slice(0, pickCount),
            submittedAt: new Date(),
          };
        }

        const strategy = getStrategy(lockedState.gameMode);
        const totalSubmissions = Object.keys(submissions).length;
        if (totalSubmissions >= strategy.getExpectedSubmissionCount(lockedState)) {
          startRevealPhase(lockedState);
          emitPlayerGameStates(io, lockedState, gamePlayerSockets);
          scheduleBotActions(gameId, io, gamePlayerSockets, socketIdToGamePlayerId);
        }
      });
    } catch (err) {
      logger.warn("round timer error (state may be gone)", err);
    }
  }, state.roundTimeoutSeconds * 1000);
  setRoundTimer(gameId, timeout);
};

export const scheduleAutoAdvance = (
  gameId: string,
  io: Server,
  gamePlayerSockets: Map<string, Set<string>>,
  socketIdToGamePlayerId: Map<string, string>,
  scheduleBotActionsFn: (
    gameId: string,
    io: Server,
    gamePlayerSockets: Map<string, Set<string>>,
    socketIdToGamePlayerId: Map<string, string>,
  ) => void,
  delayMs: number = 15000,
): void => {
  const timeout = setTimeout(async () => {
    try {
      await withGameLock(gameId, async () => {
        const state = getGameState(gameId);
        if (!state.winnerReveal) return;
        if (state.winnerReveal.isFinalRound) {
          const results = await endGame(state, state.winnerReveal.gameWinnerId ?? null);
          await endGameCleanup(io, gameId, results, gamePlayerSockets, socketIdToGamePlayerId);
        } else {
          await startNextRound(state);
          emitPlayerGameStates(io, state, gamePlayerSockets);
          scheduleBotActionsFn(gameId, io, gamePlayerSockets, socketIdToGamePlayerId);
          setTimedRoundTimer(gameId, io, scheduleBotActionsFn, gamePlayerSockets, socketIdToGamePlayerId);
        }
      });
    } catch (err) {
      logger.warn("auto-advance error (state may be gone)", err);
    }
  }, delayMs);
  setAutoAdvanceTimeout(gameId, timeout);
};

export const emitPlayerGameStates = (
  io: Server,
  state: GameState,
  gamePlayerSockets: Map<string, Set<string>>,
) => {
  // Iterate over the players of this game
  for (const playerId of state.players.keys()) {
    const socketIds = gamePlayerSockets.get(playerId);
    if (!socketIds) continue; // If the player has no connected sockets, skip sending the update

    const dto = toPlayerGameStateDto(state, playerId);
    for (const socketId of socketIds) {
      io.to(socketId).emit("game:state", dto); // Send the updated state only to this player's sockets
    }
  }
};

export const endGameCleanup = async (
  io: Server,
  gameId: string,
  results: EndGameResults,
  gamePlayerSockets: Map<string, Set<string>>,
  socketIdToGamePlayerId: Map<string, string>,
) => {
  const gameRoom = `game:${gameId}`;
  const lobbyRoom = `lobby:${results.lobbyId}`;

  clearRoundTimer(gameId);

  // Notify everyone that the game has ended
  io.to(gameRoom).emit("game:ended", results);

  // Move all connected sockets back to the lobby
  const sockets = await io.in(gameRoom).fetchSockets();

  for (const socket of sockets) {
    socket.leave(gameRoom);
    socket.join(lobbyRoom);
    socket.data.gameId = undefined;
  }

  // Remove old GamePlayer -> Socket mappings and reverse map
  for (const player of results.players) {
    const sockets = gamePlayerSockets.get(player.gamePlayerId);
    if (sockets) {
      for (const sid of sockets) {
        socketIdToGamePlayerId.delete(sid);
      }
    }
    gamePlayerSockets.delete(player.gamePlayerId);
  }
};

export const emitPlayerReconnected = (
  io: Server,
  userId: string,
) => {
  try {
    const gameId = findActiveGameByUserId(userId);
    if (!gameId) return;
    const state = getGameState(gameId);
    const gamePlayerId = resolveGamePlayerId(userId);
    if (!gamePlayerId) return;
    const player = state.players.get(gamePlayerId);
    io.to(`game:${gameId}`).emit("game:playerReconnected", {
      gamePlayerId,
      userId,
      username: player?.username ?? userId,
    });
  } catch {
    // Game state may be gone
  }
};
