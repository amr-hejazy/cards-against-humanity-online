import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "http";
import { Server } from "socket.io";
import { io as ioc, Socket as ClientSocket } from "socket.io-client";
import { registerGameHandlers } from "../../src/socket/game.socket";
import { registerLobbyHandlers } from "../../src/socket/lobby.socket";
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
  serverUrl = await createSocketServer();

  io.use((socket, next) => {
    const userId = socket.handshake.auth?.userId;
    if (!userId) {
      return next(new Error("Authentication required"));
    }
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

const waitForLobbyUpdated = (
  client: ClientSocket,
  predicate: (dto: any) => boolean,
): Promise<any> => {
  return new Promise((resolve) => {
    const handler = (dto: any) => {
      if (predicate(dto)) {
        client.off("lobby:updated", handler);
        resolve(dto);
      }
    };
    client.on("lobby:updated", handler);
  });
};

describe("Game Socket — game:join", () => {
  it("rejects join with invalid gameId", async () => {
    const user = await createTestUser();
    const client = await connectClient(user.id);

    const error = await new Promise<any>((resolve) => {
      client.on("game:error", (err: any) => resolve(err));
      client.emit("game:join", {
        gameId: "00000000-0000-0000-0000-000000000000",
      });
    });

    expect(error.type).toBe("GAME_NOT_FOUND");
    client.close();
  });

  it(
    "joins game after full lobby socket flow",
    async () => {
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

      await new Promise<void>((resolve) => {
        c1.on("lobby:updated", () => resolve());
        c1.emit("lobby:ready", { isReady: true });
      });

      await new Promise<void>((resolve) => {
        c1.on("lobby:updated", () => resolve());
        c2.emit("lobby:ready", { isReady: true });
      });

      await new Promise<void>((resolve) => {
        c1.on("lobby:updated", () => resolve());
        c3.emit("lobby:ready", { isReady: true });
      });

      const gameStarted = await new Promise<any>((resolve) => {
        c1.once("game:started", (p: any) => resolve(p));
        c1.emit("game:start", { roomCode });
      });

      expect(gameStarted.gameId).toBeTruthy();
      expect(gameStarted.roomCode).toBe(roomCode);

      const joinState = await new Promise<any>((resolve) => {
        c1.once("game:state", (s: any) => resolve(s));
        c1.emit("game:join", { gameId: gameStarted.gameId });
      });

      expect(joinState.game.gameId).toBe(gameStarted.gameId);
      expect(joinState.player.hand).toHaveLength(10);

      c1.close();
      c2.close();
      c3.close();
    },
    60000,
  );
});

describe("Game Socket — game:error on invalid action", () => {
  it("emits game:error when non-host tries game:start", async () => {
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
    await new Promise<void>((resolve) => {
      c1.on("lobby:updated", () => resolve());
      c1.emit("lobby:ready", { isReady: true });
    });
    await new Promise<void>((resolve) => {
      c1.on("lobby:updated", () => resolve());
      c2.emit("lobby:ready", { isReady: true });
    });
    await new Promise<void>((resolve) => {
      c1.on("lobby:updated", () => resolve());
      c3.emit("lobby:ready", { isReady: true });
    });

    const error = await new Promise<any>((resolve) => {
      c2.on("game:error", (err: any) => resolve(err));
      c2.emit("game:start", { roomCode });
    });

    expect(error.type).toBe("NOT_HOST");

    c1.close();
    c2.close();
    c3.close();
  });
});
