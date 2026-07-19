import { sql } from "drizzle-orm";
import { db } from "../../../db/client";
import logger from "../../../core/logger";

/**
 * Deletes guest users older than 24 hours who are not in any lobby or game.
 */
export const cleanupOrphanedGuests = async (): Promise<number> => {
  try {
    const result = await db.execute(sql`
      DELETE FROM users
      WHERE password_hash IS NULL
        AND email IS NULL
        AND created_at < NOW() - INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM lobby_players lp WHERE lp.user_id = users.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM game_players gp WHERE gp.user_id = users.id
        )
      RETURNING id
    `);
    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info(`Cleaned up ${count} orphaned guest users`);
    }
    return count;
  } catch (err) {
    logger.warn("Failed to clean up orphaned guests", err);
    return 0;
  }
};
