import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "http";
import { Server } from "socket.io";
import { io as ioc, Socket as ClientSocket } from "socket.io-client";
import { registerLobbyHandlers, setDisconnectGraceMs, setMidGameDisconnectGraceMs } from "../../src/socket/lobby.socket";
import { registerGameHandlers } from "../../src/socket/game.socket";
import { createTestUser } from "../helpers";

let httpServer: ReturnType<typeof createServer>;
let io: Server;
let serverUrl: string;

const createSocketServer = () => {
  httpServer = createServer();
  io = new Server(httpServer, { cors: { origin: "*" } });
  serverUrl = `http://localhost:${0}`;
  return new Promise<string>((resolve) => {
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve(`http://localhost:${port}`);
    });
  });
};

beforeAll(async () => {
  // Disconnect cleanup is immediate in tests — no grace period
  setDisconnectGraceMs(0);
  setMidGameDisconnectGraceMs(0);
  serverUrl = await createSocketServer();
  io.use((socket, next) => {
    const userId = socket.handshake.auth?.userId;
    if (!userId) return next(new Error("Authentication required"));
    (socket as any).data = { userId };
    next();
  });
  io.on("connection", (socket) => {
    registerLobbyHandlers(io, socket);
    registerGameHandlers(io, socket);
  });
});

afterAll(() => {
  io?.close();
  httpServer?.close();
});

const connectClient = async (userId: string): Promise<ClientSocket> => {
  const client = ioc(serverUrl, {
    auth: { userId },
    transports: ["websocket"],
    forceNew: true,
  });
  await new Promise<void>((resolve, reject) => {
    client.on("connect", () => resolve());
    client.on("connect_error", reject);
    client.connect();
  });
  return client;
};

const setupGameInProgress = async () => {
  const u1 = await createTestUser();
  const u2 = await createTestUser();
  const u3 = await createTestUser();
  const c1 = await connectClient(u1.id);
  const c2 = await connectClient(u2.id);
  const c3 = await connectClient(u3.id);

  const roomCode = await new Promise<string>((resolve) => {
    c1.once("lobby:created", (dto: any) => resolve(dto.roomCode));
    c1.emit("lobby:create", { maxPlayers: 3 });
  });

  await new Promise<void>((resolve) => {
    c1.on("lobby:updated", () => resolve());
    c2.emit("lobby:join", { roomCode });
  });
  await new Promise<void>((resolve) => {
    c1.on("lobby:updated", () => resolve());
    c3.emit("lobby:join", { roomCode });
  });

  for (const client of [c1, c2, c3]) {
    await new Promise<void>((resolve) => {
      c1.once("lobby:updated", () => resolve());
      client.emit("lobby:ready", { isReady: true });
    });
  }

  const gameStarted = await new Promise<any>((resolve) => {
    c1.once("game:started", (p: any) => resolve(p));
    c1.emit("game:start", { roomCode });
  });

  for (const client of [c1, c2, c3]) {
    await new Promise<void>((resolve, reject) => {
      client.once("game:state", () => resolve());
      client.once("game:error", (err: any) => reject(new Error(`game:join error: ${err.type} ${err.message}`)));
      client.emit("game:join", { gameId: gameStarted.gameId });
    });
  }

  return { u1, u2, u3, c1, c2, c3, roomCode, gameId: gameStarted.gameId };
};

describe("3-tab disconnect mid-game", () => {
  it(
    "lobby:leave mid-game: remaining get game:cancelled + lobby:updated, leaver gets leaveConfirmed",
    async () => {
      const { u1, u2, u3, c1, c2, c3, roomCode } = await setupGameInProgress();

      // Register ALL listeners BEFORE emit (events fire in order: lobby:updated, game:cancelled)
      const cancelledP = new Promise<any>((resolve) => {
        c1.once("game:cancelled", (p: any) => resolve(p));
      });
      const updatedP = new Promise<any>((resolve) => {
        c1.on("lobby:updated", (dto: any) => {
          if (dto.players.length === 2) resolve(dto);
        });
      });
      const confirmedP = new Promise<any>((resolve) => {
        c3.once("lobby:leaveConfirmed", (p: any) => resolve(p));
      });

      c3.emit("lobby:leave", { roomCode });

      const cancelled = await cancelledP;
      expect(cancelled.roomCode).toBe(roomCode);

      const updated = await updatedP;
      expect(updated.players).toHaveLength(2);
      expect(updated.players.some((p: any) => p.userId === u3.id)).toBe(false);

      const confirmed = await confirmedP;
      expect(confirmed.roomCode).toBe(roomCode);

      c1.close();
      c2.close();
      c3.close();
    },
    30000,
  );

  it(
    "disconnect mid-game: remaining get game:cancelled + lobby:updated, reconnecting gets errors",
    async () => {
      const { u1, u2, u3, c1, c2, c3, roomCode, gameId } = await setupGameInProgress();

      // Register listeners BEFORE disconnect
      const cancelledP = new Promise<any>((resolve) => {
        c1.once("game:cancelled", (p: any) => resolve(p));
      });
      const updatedP = new Promise<any>((resolve) => {
        c1.on("lobby:updated", (dto: any) => {
          if (dto.players.length === 2) resolve(dto);
        });
      });

      c3.close();

      const cancelled = await cancelledP;
      expect(cancelled.roomCode).toBe(roomCode);

      const updated = await updatedP;
      expect(updated.players).toHaveLength(2);
      expect(updated.status).toBe("WAITING");

      // Reconnect same user — should get errors for both game and lobby
      const c3_re = await connectClient(u3.id);

      const gameError = await new Promise<any>((resolve) => {
        c3_re.once("game:error", (err: any) => resolve(err));
        c3_re.emit("game:join", { gameId });
      });
      expect(gameError.type).toBe("GAME_NOT_FOUND");

      const lobbyError = await new Promise<any>((resolve) => {
        c3_re.once("lobby:error", (err: any) => resolve(err));
        c3_re.emit("lobby:get", { roomCode });
      });
      expect(lobbyError.type).toBe("NOT_IN_LOBBY");

      c1.close();
      c2.close();
      c3_re.close();
    },
    30000,
  );
});
