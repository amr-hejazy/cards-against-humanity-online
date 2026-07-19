import { Server as HttpServer } from "http";
import { Server } from "socket.io";

import {
  registerLobbyHandlers,
  cancelDisconnectCleanup,
  incrementSocketCount,
  disconnectTimeouts,
} from "./lobby.socket";
import { registerGameHandlers } from "./game.socket";
import { emitPlayerReconnected } from "./game.socket.helpers";
import { verifyAuthToken } from "../utils/jwt";
import { AppError, ErrorTypes } from "../core/error/errors";

export let io: Server; // Export the io instance for use in other modules

export const initializeSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  // Authenticate every socket connection via JWT from handshake auth
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(
        new AppError(
          401,
          "Unauthorized: No token provided",
          ErrorTypes.UNAUTHORIZED,
        ),
      );
    }

    try {
      const decoded = verifyAuthToken(token);
      socket.data.userId = decoded.userId; // Trusted userId for the entire connection lifetime
      next();
    } catch {
      next(
        new AppError(
          401,
          "Unauthorized: Invalid or expired token",
          ErrorTypes.UNAUTHORIZED,
        ),
      );
    }
  });

  io.on("connection", (socket) => {
    // Only emit reconnected event if user had a pending disconnect timeout (actual reconnect)
    const isReconnect = disconnectTimeouts.has(socket.data.userId);
    // Cancel any pending disconnect cleanup so user stays in lobby/game
    cancelDisconnectCleanup(socket.data.userId);
    if (isReconnect) {
      emitPlayerReconnected(io, socket.data.userId);
    }
    incrementSocketCount(socket.data.userId);
    registerLobbyHandlers(io, socket);
    registerGameHandlers(io, socket);
  });

  return io;
};
