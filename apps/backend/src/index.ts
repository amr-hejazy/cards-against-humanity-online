import "dotenv/config";
import app from "./app";
import { env } from "./env";
import logger from "./core/logger";
import { pool } from "./db/client";
import { createServer, Server as HttpServer } from "http";
import { initializeSocket } from "./socket";
import { resetStuckGames } from "./features/game/game.service";
import { cleanupOrphanedGuests } from "./features/auth/service/cleanup.service";
import { initRedis } from "./core/redis/client";

const port = Number(env.PORT ?? 3000);

let server: HttpServer | null = null;
let shuttingDown = false;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

const RETRY_DELAY = 2000;
const MAX_RETRIES = 10;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const connectDb = async (attempt: number = 1): Promise<void> => {
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      logger.error(`Failed to connect to PostgreSQL after ${MAX_RETRIES} attempts`);
      throw err;
    }
    logger.warn(
      `PostgreSQL connection attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${RETRY_DELAY}ms...`,
    );
    await wait(RETRY_DELAY);
    return connectDb(attempt + 1);
  }
};

const start = async () => {
  try {
    await connectDb();

    logger.info("Connected to PostgreSQL");

    // Reset stuck games and lobbies from previous server instance
    // (in-memory GameState was lost on restart)
    const { gameCount, lobbyCount } = await resetStuckGames();
    if (gameCount > 0) {
      logger.info(`Reset ${gameCount} stuck games and ${lobbyCount} lobbies from previous session`);
    }

    // Initialize Upstash Redis client (non-fatal if env vars missing — app continues without it)
    initRedis();

    // Clean up orphaned guest users on startup and periodically
    await cleanupOrphanedGuests();
    cleanupInterval = setInterval(() => {
      cleanupOrphanedGuests().catch((err) => logger.warn("Periodic guest cleanup failed", err));
    }, 6 * 60 * 60 * 1000); // every 6 hours
    cleanupInterval.unref();

    const httpServer = createServer(app);

    initializeSocket(httpServer);

    server = httpServer.listen(port, () => {
      logger.info(`Server is listening on port ${port}`);
    });
  } catch (err) {
    logger.error(`Error starting the server: ${String(err)}`);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal: string) => {
  if (shuttingDown) {
    logger.warn(
      `Received shutdown signal (${signal}) while already shutting down`,
    );
    return;
  }

  shuttingDown = true;

  try {
    logger.info(`Received shutdown signal (${signal}), closing server`);
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => {
          logger.info("HTTP server closed");
          resolve();
        });
      });
    }

    await pool.end();
    logger.info("PostgreSQL pool closed");
    process.exit(0);
  } catch (err: any) {
    logger.error(`Error during shutdown: ${String(err)}`);
    process.exit(1);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${String(err)}`);
  void gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled promise rejection: ${String(reason)}`);
  void gracefulShutdown("unhandledRejection");
});

start();
