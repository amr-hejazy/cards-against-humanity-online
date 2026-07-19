import { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../../../utils/jwt";
import { AppError, ErrorTypes } from "../../../core/error/errors";
import { db } from "../../../db/client";
import { eq } from "drizzle-orm";
import { users } from "../../../db/schema";
import { getRedisClient, isRedisAvailable } from "../../../core/redis/client";

const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw new AppError(
      401,
      "Unauthorized: No token provided",
      ErrorTypes.UNAUTHORIZED,
    );
  }

  const token = authorization.slice("Bearer ".length);

  try {
    const decoded = verifyAuthToken(token);

    // Check Redis cache for user existence before hitting DB
    if (isRedisAvailable()) {
      const client = getRedisClient();
      if (client) {
        try {
          const exists = await client.get(`user:${decoded.userId}:exists`);
          if (exists === "1") {
            res.locals.auth = decoded;
            next();
            return;
          }
        } catch {
          // Redis error — fall through to DB query
        }
      }
    }

    // Cache miss or Redis unavailable — query DB
    const user = await db.query.users.findFirst({
      where: eq(users.id, decoded.userId),
    });
    if (!user) {
      throw new AppError(
        401,
        "Unauthorized: User no longer exists",
        ErrorTypes.UNAUTHORIZED,
      );
    }

    // Seed Redis cache so subsequent requests skip the DB query
    if (isRedisAvailable()) {
      const client = getRedisClient();
      if (client) {
        try {
          await client.setex(`user:${decoded.userId}:exists`, 300, "1");
        } catch {
          // Cache write failure is non-fatal
        }
      }
    }

    res.locals.auth = decoded;
    next();
  } catch {
    throw new AppError(
      401,
      "Unauthorized: Invalid or expired token",
      ErrorTypes.UNAUTHORIZED,
    );
  }
};

export default requireAuth;
