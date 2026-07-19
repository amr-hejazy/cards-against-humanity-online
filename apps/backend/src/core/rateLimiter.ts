import { Request, Response, NextFunction } from "express";
import { getRedisClient, isRedisAvailable } from "./redis/client";
import { AppError, ErrorTypes } from "./error/errors";

type RateLimiterOptions = {
  keyPrefix: string;
  maxRequests: number;
  windowSeconds: number;
  message?: string;
};

export const createRateLimiter = (options: RateLimiterOptions) => {
  const { keyPrefix, maxRequests, windowSeconds } = options;
  const message = options.message ?? `Too many requests. Try again in ${windowSeconds}s.`;

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    // Skip rate limiting if Redis is not available
    if (!isRedisAvailable()) {
      next();
      return;
    }

    const client = getRedisClient();
    if (!client) {
      next();
      return;
    }

    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const key = `rate:${keyPrefix}:${ip}`;

    try {
      const current = await client.incr(key);

      // Set expiry on first request in the window
      if (current === 1) {
        await client.expire(key, windowSeconds);
      }

      if (current > maxRequests) {
        throw new AppError(429, message, ErrorTypes.RATE_LIMIT);
      }

      next();
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      // Redis error — allow the request through
      next();
    }
  };
};
