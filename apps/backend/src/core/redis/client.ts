import { Redis } from "@upstash/redis";
import { env } from "../../env";
import logger from "../logger";

let redisClient: Redis | null = null;
let redisAvailable = false;

export const getRedisClient = (): Redis | null => {
  return redisClient;
};

export const isRedisAvailable = (): boolean => {
  return redisAvailable;
};

export const initRedis = (): void => {
  // Upstash Redis is HTTP-based — no persistent connection needed
  // Just validate env vars and create the client
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    logger.info("Upstash Redis env vars not set — running without Redis");
    redisClient = null;
    redisAvailable = false;
    return;
  }

  try {
    redisClient = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    redisAvailable = true;
    logger.info("Upstash Redis client initialized");
  } catch (err) {
    logger.warn(`Failed to initialize Upstash Redis: ${String(err)}. Continuing without Redis.`);
    redisClient = null;
    redisAvailable = false;
  }
};

export const getOrSetCache = async <T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds = 300,
): Promise<T> => {
  if (!redisAvailable || !redisClient) {
    return fetchFn();
  }

  try {
    const cached = await redisClient.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
  } catch {
    return fetchFn();
  }

  const data = await fetchFn();

  try {
    await redisClient.setex(key, ttlSeconds, data);
  } catch {
    // Cache write failure is non-fatal
  }

  return data;
};
