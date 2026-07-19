import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "http";
import { Server } from "socket.io";
import { io as ioc, Socket as ClientSocket } from "socket.io-client";
import { registerLobbyHandlers } from "../../src/socket/lobby.socket";
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

describe("Lobby Socket — lobby:create", () => {
  it("creates lobby and emits lobby:created", async () => {
    const user = await createTestUser();
    const client = await connectClient(user.id);

    const payload = await new Promise<any>((resolve) => {
      client.on("lobby:created", (dto: any) => resolve(dto));
      client.emit("lobby:create", { maxPlayers: 4 });
    });

    expect(payload.roomCode).toBeTruthy();
    expect(payload.roomCode).toHaveLength(6);
    expect(payload.hostUserId).toBe(user.id);
    expect(payload.players).toHaveLength(1);
    client.close();
  });

  it("emits lobby:error when user already in lobby", async () => {
    const user = await createTestUser();
    const client = await connectClient(user.id);

    await new Promise<void>((resolve) => {
      client.on("lobby:created", () => {
        client.emit("lobby:create", { maxPlayers: 4 });
      });
      client.on("lobby:error", (err: any) => {
        expect(err.type).toBe("PLAYER_ALREADY_IN_LOBBY");
        resolve();
      });
      client.emit("lobby:create", { maxPlayers: 4 });
    });
    client.close();
  });
});

describe("Lobby Socket — lobby:join", () => {
  it("joins lobby and all members receive lobby:updated", async () => {
    const host = await createTestUser();
    const joiner = await createTestUser();
    const hostClient = await connectClient(host.id);
    const joinClient = await connectClient(joiner.id);

    const { roomCode } = await new Promise<any>((resolve) => {
      hostClient.on("lobby:created", (dto: any) => resolve(dto));
      hostClient.emit("lobby:create", { maxPlayers: 4 });
    });

    const updated = await new Promise<any>((resolve) => {
      hostClient.on("lobby:updated", (dto: any) => {
        if (dto.players.length === 2) resolve(dto);
      });
      joinClient.emit("lobby:join", { roomCode });
    });

    expect(updated.players).toHaveLength(2);
    hostClient.close();
    joinClient.close();
  });
});

describe("Lobby Socket — lobby:leave", () => {
  it("removes player and emits lobby:updated", async () => {
    const host = await createTestUser();
    const leaver = await createTestUser();
    const hostClient = await connectClient(host.id);
    const leaveClient = await connectClient(leaver.id);

    const { roomCode } = await new Promise<any>((resolve) => {
      hostClient.on("lobby:created", (dto: any) => resolve(dto));
      hostClient.emit("lobby:create", { maxPlayers: 4 });
    });

    await new Promise<void>((resolve) => {
      hostClient.on("lobby:updated", (dto: any) => {
        if (dto.players.length === 2) resolve();
      });
      leaveClient.emit("lobby:join", { roomCode });
    });

    const afterLeave = await new Promise<any>((resolve) => {
      hostClient.on("lobby:updated", (dto: any) => {
        if (dto.players.length === 1) resolve(dto);
      });
      leaveClient.emit("lobby:leave", { roomCode });
    });

    expect(afterLeave.players).toHaveLength(1);
    expect(afterLeave.hostUserId).toBe(host.id);
    hostClient.close();
    leaveClient.close();
  });
});

describe("Lobby Socket — lobby:ready", () => {
  it("toggles ready status and emits lobby:updated", async () => {
    const host = await createTestUser();
    const client = await connectClient(host.id);

    const created = await new Promise<any>((resolve) => {
      client.on("lobby:created", (dto: any) => resolve(dto));
      client.emit("lobby:create", { maxPlayers: 4 });
    });

    const updated = await new Promise<any>((resolve) => {
      client.on("lobby:updated", (dto: any) => resolve(dto));
      client.emit("lobby:ready", { isReady: true });
    });

    expect(updated.players[0].isReady).toBe(true);
    client.close();
  });
});

describe("Lobby Socket — lobby:updateSettings", () => {
  it("rejects non-host", async () => {
    const host = await createTestUser();
    const other = await createTestUser();
    const hostClient = await connectClient(host.id);
    const otherClient = await connectClient(other.id);

    const { roomCode } = await new Promise<any>((resolve) => {
      hostClient.on("lobby:created", (dto: any) => resolve(dto));
      hostClient.emit("lobby:create", { maxPlayers: 4 });
    });

    const err = await new Promise<any>((resolve) => {
      otherClient.on("lobby:error", (e: any) => resolve(e));
      otherClient.emit("lobby:join", { roomCode });
      setTimeout(() => {
        otherClient.emit("lobby:updateSettings", { roomCode, winningScore: 10 });
      }, 100);
    });

    expect(err.action).toBe("updateSettings");
    hostClient.close();
    otherClient.close();
  });

  it("updates settings and broadcasts lobby:updated", async () => {
    const host = await createTestUser();
    const client = await connectClient(host.id);

    const { roomCode } = await new Promise<any>((resolve) => {
      client.on("lobby:created", (dto: any) => resolve(dto));
      client.emit("lobby:create", { maxPlayers: 4 });
    });

    const updated = await new Promise<any>((resolve) => {
      client.on("lobby:updated", (dto: any) => {
        if (dto.winningScore === 10) resolve(dto);
      });
      client.emit("lobby:updateSettings", { roomCode, winningScore: 10, maxRounds: 7 });
    });

    expect(updated.winningScore).toBe(10);
    expect(updated.maxRounds).toBe(7);
    client.close();
  });
});
