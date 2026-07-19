import { Server, Socket } from "socket.io";
import type {
  CreateLobbyPayload,
  GetLobbyPayload,
  JoinLobbyPayload,
  LeaveLobbyPayload,
  SetPlayerReadyPayload,
  AddBotPayload,
  RemoveBotPayload,
  UpdateLobbySettingsPayload,
} from "@cah/shared";
import {
  createLobby,
  joinLobby,
  leaveLobby,
  getLobby,
  updateLobbySettings,
} from "../features/lobby/lobby.service";
import {
  setPlayerReady,
} from "../features/lobby/lobby.helpers";
import { toLobbyDto } from "../features/lobby/lobby.mapper";
import { emitSocketError } from "../core/error/socketErrors";
import logger from "../core/logger";
import { AppError, ErrorTypes } from "../core/error/errors";
import {
  findGameByLobbyId,
  findActiveGameByUserId,
  findGameByGameId,
} from "../features/game/game.state";
import {
  gamePlayerSockets,
  cleanupGameSocketMapsForPlayer,
  getGamePlayerIdBySocketId,
  clearAutoAdvanceTimeout,
} from "../core/game/game-maps";
import { emitPlayerGameStates } from "./game.socket.helpers";
import { scheduleDisconnectCleanup } from "./lobby.socket.helpers";
import { lobbyBots } from "../core/game/lobby-bot.state";

// Disconnect grace period: when a socket disconnects, wait N ms before cleaning up.
// If the same user reconnects within that window, cancel the pending cleanup.
// This prevents lobby deletion on page refresh (the only common case).
// Mid-game disconnects use a shorter timeout so remaining players aren't stuck long.
export let disconnectGraceMs = 20_000;
export let midGameDisconnectGraceMs = 10_000;
export const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

// Track concurrent sockets per user to avoid cleaning up when multi-tab users close one tab.
const socketCountPerUser = new Map<string, number>();

export const incrementSocketCount = (userId: string): number => {
  const count = (socketCountPerUser.get(userId) ?? 0) + 1;
  socketCountPerUser.set(userId, count);
  return count;
};

/** Override grace period (used in tests to avoid waits). */
export const setDisconnectGraceMs = (ms: number) => {
  disconnectGraceMs = ms;
};
export const setMidGameDisconnectGraceMs = (ms: number) => {
  midGameDisconnectGraceMs = ms;
};

export const cancelDisconnectCleanup = (userId: string) => {
  const existing = disconnectTimeouts.get(userId);
  if (existing) {
    clearTimeout(existing);
    disconnectTimeouts.delete(userId);
  }
};

export const registerLobbyHandlers = (io: Server, socket: Socket) => {
  // Handle lobby creation
  socket.on("lobby:create", async (payload: CreateLobbyPayload) => {
    try {
      // 1. Call the service function to create a lobby using the authenticated user's ID
      const userId = socket.data.userId;
      const lobby = await createLobby(userId, payload.maxPlayers);
      // 1a. If socket disconnected during async op, clean up and bail
      if (!socket.connected) {
        await leaveLobby(lobby.roomCode, userId).catch(() => ({
          lobby: null,
          gameCancelled: false,
        }));
        return;
      }
      // 2. Store lobbyId and roomCode on socket for later use
      socket.data.lobbyId = lobby.id;
      socket.data.roomCode = lobby.roomCode;
      // 3. Join the creator to the lobby room
      await socket.join(`lobby:${lobby.id}`);
      // 4. Convert the lobby state to DTO (with bots) and send it back to the creator
      const dto = toLobbyDto(lobby, null, lobbyBots.getBots(lobby.id));
      io.to(`lobby:${lobby.id}`).emit("lobby:created", dto);
    } catch (err) {
      emitSocketError(socket, "lobby:error", "create", err);
    }
  });

  // Handle joining a lobby
  socket.on("lobby:join", async (payload: JoinLobbyPayload) => {
    try {
      // 1. Call the service function to join a lobby using the authenticated user's ID
      const userId = socket.data.userId;
      const lobby = await joinLobby(payload.roomCode, userId);
      // 1a. If socket disconnected during async op, clean up and bail
      if (!socket.connected) {
        await leaveLobby(lobby.roomCode, userId).catch(() => ({
          lobby: null,
          gameCancelled: false,
        }));
        return;
      }
      // User actively joined a lobby — cancel any pending disconnect timeout
      cancelDisconnectCleanup(userId);
      // 2. Store lobbyId and roomCode on socket for later use
      socket.data.lobbyId = lobby.id;
      socket.data.roomCode = payload.roomCode;
      // 3. Join the user to the lobby room
      await socket.join(`lobby:${lobby.id}`);
      // 4. Convert the lobby state to DTO (with bots) and notify everyone in the lobby room
      const dto = toLobbyDto(lobby, null, lobbyBots.getBots(lobby.id));
      io.to(`lobby:${lobby.id}`).emit("lobby:updated", dto);
    } catch (err) {
      emitSocketError(socket, "lobby:error", "join", err);
    }
  });

  // Handle player ready status toggle
  socket.on("lobby:ready", async (payload: SetPlayerReadyPayload) => {
    try {
      // 1. Resolve roomCode to lobbyId via stored socket data
      const lobbyId: string | undefined = socket.data.lobbyId;
      if (!lobbyId) {
        throw new AppError(400, "Not in a lobby", ErrorTypes.NOT_IN_LOBBY);
      }

      // 2. Update the player's ready state using the authenticated user's ID
      const userId = socket.data.userId;
      const lobby = await setPlayerReady(lobbyId, userId, payload.isReady);
      // 3. Convert the updated lobby state to DTO (with bots) and notify everyone in the lobby room
      const gameIdForDto = findGameByLobbyId(lobby.id)?.gameId ?? null;
      const dto = toLobbyDto(lobby, gameIdForDto, lobbyBots.getBots(lobby.id));
      io.to(`lobby:${lobby.id}`).emit("lobby:updated", dto);
    } catch (err) {
      emitSocketError(socket, "lobby:error", "ready", err);
    }
  });

  // Handle leaving a lobby
  socket.on("lobby:leave", async (payload: LeaveLobbyPayload) => {
    try {
      // 1. Ensure the user is actually in a lobby before attempting to leave
      const userId = socket.data.userId;
      const roomCode = payload.roomCode;
      if (!roomCode) return;

      const lobbyId: string | undefined = socket.data.lobbyId;
      const gameState = lobbyId ? findGameByLobbyId(lobbyId) : undefined;
      const cancelledGameId = gameState?.gameId ?? null;
      const gamePlayerIds = gameState ? [...gameState.players.keys()] : [];
      const leavingGpId = cancelledGameId
        ? getGamePlayerIdBySocketId(socket.id)
        : undefined;
      const leavingUsername = leavingGpId
        ? gameState?.players.get(leavingGpId)?.username
        : undefined;

      // 2. Call the service function to leave the lobby
      const { lobby, gameCancelled } = await leaveLobby(roomCode, userId);

      if (lobbyId) {
        await socket.leave(`lobby:${lobbyId}`);
      }

      // 3. Notify everyone in the lobby room about the updated state or deletion
      if (lobby) {
        const gameIdForDto = findGameByLobbyId(lobby.id)?.gameId ?? null;
        const dto = toLobbyDto(
          lobby,
          gameIdForDto,
          lobbyBots.getBots(lobby.id),
        );
        io.to(`lobby:${lobby.id}`).emit("lobby:updated", dto);
        // Tell leaving socket to navigate home (it left the room)
        socket.emit("lobby:leaveConfirmed", { roomCode });
      } else {
        socket.emit("lobby:deleted", { roomCode });
      }

      // 3a. If the user was in an active game, notify remaining players that the game has been cancelled and move their sockets back to the lobby
      if (gameCancelled && cancelledGameId) {
        clearAutoAdvanceTimeout(cancelledGameId);
        socket.broadcast
          .to(`game:${cancelledGameId}`)
          .emit("game:cancelled", { roomCode });
        for (const gpId of gamePlayerIds) {
          cleanupGameSocketMapsForPlayer(gpId);
        }
        const sockets = await io.in(`game:${cancelledGameId}`).fetchSockets();
        for (const s of sockets) {
          if (s.id === socket.id) continue;
          await s.leave(`game:${cancelledGameId}`);
          if (lobby) {
            await s.join(`lobby:${lobby.id}`);
          }
        }
      } else if (!gameCancelled && cancelledGameId && gameState) {
        // Game continues — player was removed from in-memory state by removePlayerFromGame
        // Notify remaining players that someone left
        io.to(`game:${cancelledGameId}`).emit("game:playerDisconnected", {
          gamePlayerId: leavingGpId,
          userId: socket.data.userId,
          username: leavingUsername ?? "Unknown",
          graceMs: 0,
        });
        // Emit updated game:state so remaining players see changes without refresh
        emitPlayerGameStates(io, gameState, gamePlayerSockets);
        const gpId = getGamePlayerIdBySocketId(socket.id);
        if (gpId) cleanupGameSocketMapsForPlayer(gpId);
      } else if (cancelledGameId) {
        // Game state gone but leaving player may still have socket map entries
        const gpId = getGamePlayerIdBySocketId(socket.id);
        if (gpId) cleanupGameSocketMapsForPlayer(gpId);
      }
      // 4. Clean up socket data
      delete socket.data.lobbyId;
      delete socket.data.roomCode;
    } catch (err) {
      emitSocketError(socket, "lobby:error", "leave", err);
    }
  });

  // Handle getting the current lobby state (for example, when a user reconnects, refreshes the page, or joins a lobby)
  socket.on("lobby:get", async (payload: GetLobbyPayload) => {
    try {
      // 1. Verify the requesting user is actually a member of this lobby before sending state
      const userId = socket.data.userId;
      const lobby = await getLobby(payload.roomCode);

      const isMember = lobby.players.some((p) => p.userId === userId);
      if (!isMember) {
        throw new AppError(403, "Not in this lobby", ErrorTypes.NOT_IN_LOBBY);
      }

      // 2. User actively requested lobby state — cancel any pending disconnect timeout
      cancelDisconnectCleanup(userId);
      // 3. Store lobbyId and roomCode on socket for later use
      socket.data.lobbyId = lobby.id;
      socket.data.roomCode = payload.roomCode;
      // 4. Join the user to the lobby room
      await socket.join(`lobby:${lobby.id}`);
      // 5. Convert the lobby state to DTO (with bots) and send it back to the requester
      const gameIdForDto = findGameByLobbyId(lobby.id)?.gameId ?? null;
      const dto = toLobbyDto(lobby, gameIdForDto, lobbyBots.getBots(lobby.id));
      socket.emit("lobby:current", dto);
    } catch (err) {
      emitSocketError(socket, "lobby:error", "get", err);
    }
  });

  // Handle adding a bot to the lobby (host only)
  socket.on("lobby:addBot", async (payload: AddBotPayload) => {
    try {
      // 1. Verify the requesting user is the host of the lobby before allowing bot addition
      const userId = socket.data.userId;
      const lobbyId: string | undefined = socket.data.lobbyId;
      if (!lobbyId) {
        throw new AppError(400, "Not in a lobby", ErrorTypes.NOT_IN_LOBBY);
      }

      const lobby = await getLobby(payload.roomCode);

      if (lobby.hostId !== userId) {
        throw new AppError(
          403,
          "Only the host can add bots",
          ErrorTypes.NOT_HOST,
        );
      }

      if (lobby.status !== "WAITING") {
        throw new AppError(
          400,
          "Cannot add bots to a game in progress",
          ErrorTypes.LOBBY_NOT_JOINABLE,
        );
      }
      // 2. If mode is blank_only, auto-switch to normal (bots incompatible with blank_only)
      if (lobby.gameMode === "blank_only") {
        await updateLobbySettings(lobby.id, userId, {
          gameMode: "normal",
          modeConfig: {},
        });
      }
      // 3. Add a bot to the lobby and notify everyone in the lobby room about the updated state
      lobbyBots.addBot(lobby.id);
      const refreshed = lobby.gameMode === "blank_only"
        ? await getLobby(payload.roomCode)
        : lobby;
      const dto = toLobbyDto(refreshed, null, lobbyBots.getBots(lobby.id));
      io.to(`lobby:${lobby.id}`).emit("lobby:updated", dto);
    } catch (err) {
      emitSocketError(socket, "lobby:error", "addBot", err);
    }
  });

  // Handle removing a bot from the lobby (host only)
  socket.on("lobby:removeBot", async (payload: RemoveBotPayload) => {
    // 1. Verify the requesting user is the host of the lobby before allowing bot removal
    try {
      const userId = socket.data.userId;
      const lobbyId: string | undefined = socket.data.lobbyId;
      if (!lobbyId) {
        throw new AppError(400, "Not in a lobby", ErrorTypes.NOT_IN_LOBBY);
      }

      const lobby = await getLobby(payload.roomCode);

      if (lobby.hostId !== userId) {
        throw new AppError(
          403,
          "Only the host can remove bots",
          ErrorTypes.NOT_HOST,
        );
      }
      // 2. Remove the specified bot from the lobby and notify everyone in the lobby room about the updated state
      lobbyBots.removeBot(lobby.id, payload.botUserId);
      const dto = toLobbyDto(lobby, null, lobbyBots.getBots(lobby.id));
      io.to(`lobby:${lobby.id}`).emit("lobby:updated", dto);
    } catch (err) {
      emitSocketError(socket, "lobby:error", "removeBot", err);
    }
  });

  // Handle updating lobby settings (host only)
  socket.on(
    "lobby:updateSettings",
    async (payload: UpdateLobbySettingsPayload) => {
      try {
        // 1. Verify the requesting user is in a lobby
        const userId = socket.data.userId;
        const lobbyId: string | undefined = socket.data.lobbyId;
        if (!lobbyId) {
          throw new AppError(400, "Not in a lobby", ErrorTypes.NOT_IN_LOBBY);
        }
        // 2. Delegate validation + persistence to the lobby service
        const fullLobby = await updateLobbySettings(lobbyId, userId, payload);
        // 3. Convert the updated lobby state to DTO and notify everyone in the lobby room
        const gameIdForDto = findGameByLobbyId(lobbyId)?.gameId ?? null;
        const dto = toLobbyDto(
          fullLobby,
          gameIdForDto,
          lobbyBots.getBots(lobbyId),
        );
        io.to(`lobby:${lobbyId}`).emit("lobby:updated", dto);
      } catch (err) {
        emitSocketError(socket, "lobby:error", "updateSettings", err);
      }
    },
  );

  // Handle socket disconnection — auto-leave lobby to prevent stuck users
  socket.on("disconnect", () => {
    handleDisconnect(socket, io).catch((err) => {
      logger.error("Unhandled disconnect error", err);
    });
  });
};

const handleDisconnect = async (socket: Socket, io: Server) => {
  const userId = socket.data.userId;
  if (!userId) return;

  try {
    // 1. Get lobbyId from socket data
    const lobbyId = socket.data.lobbyId as string | undefined;

    // 2. Check if there was an active game
    const gameId = findActiveGameByUserId(userId);
    const cancelledGameId: string | null = gameId ?? null;
    const gameState = cancelledGameId
      ? findGameByGameId(cancelledGameId)
      : undefined;
    const gamePlayerIds = gameState ? [...gameState.players.keys()] : [];

    // If other sockets for this user are still connected (multi-tab), don't schedule cleanup
    const remainingSockets = (socketCountPerUser.get(userId) ?? 1) - 1;
    if (remainingSockets > 0) {
      socketCountPerUser.set(userId, remainingSockets);
      return;
    }
    socketCountPerUser.delete(userId);

    // Emit disconnect notification to game room BEFORE cleaning up maps
    // (game.socket.ts disconnect handler can't find player after cleanup).
    if (cancelledGameId) {
      const gpId = getGamePlayerIdBySocketId(socket.id);
      if (gpId) {
        let username: string = userId;
        if (gameState) {
          const player = gameState.players.get(gpId);
          if (player) username = player.username;
        }
        io.to(`game:${cancelledGameId}`).emit("game:playerDisconnected", {
          gamePlayerId: gpId,
          userId,
          username,
          graceMs: midGameDisconnectGraceMs,
        });
        // Clear socket maps to prevent stale game:state emits
        cleanupGameSocketMapsForPlayer(gpId);
      }
    }

    // Schedule delayed cleanup — gives user time to reconnect on page refresh.
    // Mid-game: shorter timeout so remaining players aren't stuck.
    // If a new socket for this userId connects within the grace period,
    // the connection handler in socket/index.ts cancels the pending timeout.
    const delay = cancelledGameId
      ? midGameDisconnectGraceMs
      : disconnectGraceMs;
    scheduleDisconnectCleanup(
      io,
      userId,
      lobbyId,
      cancelledGameId,
      gamePlayerIds,
      delay,
    );
  } catch (err) {
    logger.warn("Disconnect cleanup scheduling failed", err);
  }
};
