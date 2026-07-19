import { Server } from "socket.io";
import { removeUserFromLobby } from "../features/lobby/lobby.helpers";
import { toLobbyDto } from "../features/lobby/lobby.mapper";
import { lobbyBots } from "../core/game/lobby-bot.state";
import {
  findGameByGameId,
  findGameByLobbyId,
} from "../features/game/game.state";
import { gamePlayerSockets } from "../core/game/game-maps";
import { emitPlayerGameStates } from "./game.socket.helpers";
import logger from "../core/logger";
import {
  cleanupGameSocketMapsForPlayer,
  clearAutoAdvanceTimeout,
} from "../core/game/game-maps";
import {
  cancelDisconnectCleanup,
  disconnectGraceMs,
  disconnectTimeouts,
} from "./lobby.socket";

export const scheduleDisconnectCleanup = (
  io: Server,
  userId: string,
  lobbyId: string | undefined,
  cancelledGameId: string | null,
  gamePlayerIds: string[],
  delayMs: number = disconnectGraceMs,
) => {
  // If a cleanup was already scheduled for this user, cancel it and reschedule.
  cancelDisconnectCleanup(userId);
  // summary of timeout : if the user does not reconnect within the grace period (to any lobby or game),
  // remove them from any lobby they are in and notify remaining players.
  // If they were in a game, cancel the game and move remaining players back to the lobby.
  const timeout = setTimeout(async () => {
    disconnectTimeouts.delete(userId);
    try {
      // 1. Remove the user from any lobby they are in (if any)
      const result = await removeUserFromLobby(userId);
      if (!result) {
        // User was not in a lobby, but may have been in a game. Clean up game socket maps if needed.
        if (cancelledGameId) {
          for (const gpId of gamePlayerIds) {
            cleanupGameSocketMapsForPlayer(gpId);
          }
        }
        return;
      }
      // 2. If the user was in a lobby, notify remaining players and handle game cancellation if applicable
      if (result.gameCancelled && cancelledGameId) {
        clearAutoAdvanceTimeout(cancelledGameId);
        io.to(`game:${cancelledGameId}`).emit("game:cancelled", {
          roomCode: result.roomCode,
        });
        for (const gpId of gamePlayerIds) {
          cleanupGameSocketMapsForPlayer(gpId);
        }
        const sockets = await io.in(`game:${cancelledGameId}`).fetchSockets();
        const targetLobbyId = result.lobby?.id ?? result.lobbyId;
        for (const s of sockets) {
          await s.leave(`game:${cancelledGameId}`);
          await s.join(`lobby:${targetLobbyId}`);
        }
      } else if (!result.gameCancelled && cancelledGameId) {
        // Game continues — player was removed from in-memory state by removeUserFromLobby → leaveLobby → removePlayerFromGame
        // Emit updated game:state so remaining players see changes without refresh
        const gameState = findGameByGameId(cancelledGameId);
        if (gameState) {
          emitPlayerGameStates(io, gameState, gamePlayerSockets);
        }
      }
      if (result.lobby) {
        const gameId = findGameByLobbyId(result.lobby.id)?.gameId ?? null;
        io.to(`lobby:${result.lobby.id}`).emit(
          "lobby:updated",
          toLobbyDto(result.lobby, gameId, lobbyBots.getBots(result.lobby.id)),
        );
      } else {
        io.to(`lobby:${result.lobbyId}`).emit("lobby:deleted", {
          roomCode: result.roomCode,
        });
      }
    } catch (err) {
      logger.warn("Delayed disconnect cleanup failed", userId, err);
    }
  }, delayMs);
  disconnectTimeouts.set(userId, timeout);
};
