import { eq, sql } from "drizzle-orm";
import { db, Tx } from "../../db/client";
import { lobbyPlayers, lobbies } from "../../db/schema";
import { AppError, ErrorTypes } from "../../core/error/errors";
import { leaveLobby } from "./lobby.service";

/**
 * Helper function to generate a unique 6-character room code for the lobby.
 * @returns {string} A unique 6-character room code.
 */

export const generateUniqueRoomCode = async (tx: Tx): Promise<string> => {
  while (true) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const roomCode = Array.from(
      { length: 6 },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join("");

    // Check if the generated room code already exists in the database
    const exists = await tx.query.lobbies.findFirst({
      where: eq(lobbies.roomCode, roomCode),
    });

    if (!exists) {
      return roomCode;
    }
  }
};

/**
 * A helper function to retrieve a lobby along with its players within a transaction.
 * @param tx
 * @param lobbyId
 * @returns The lobby state with players, or null if not found
 */
export const getLobbyWithPlayers = async (tx: Tx, lobbyId: string) => {
  const lobby = await tx.query.lobbies.findFirst({
    where: eq(lobbies.id, lobbyId),
    with: {
      players: {
        with: {
          user: true,
        },
      },
    },
  });
  if (!lobby) {
    throw new AppError(404, "Lobby not found", ErrorTypes.LOBBY_NOT_FOUND);
  }
  return lobby;
};

/**
 * Helper function to remove a user from any lobby they are currently in. Useful for cleanup on socket disconnect or user logout.
 * @param userId
 * @returns An object containing the lobby state (or null if lobby was deleted), lobbyId, and roomCode. Returns null if the user was not in a lobby.
 */
export const removeUserFromLobby = async (userId: string) => {
  const existing = await db.query.lobbyPlayers.findFirst({
    where: eq(lobbyPlayers.userId, userId),
    with: { lobby: true },
  });

  if (!existing) return null;

  const result = await leaveLobby(existing.lobby.roomCode, userId);
  return {
    lobby: result.lobby,
    lobbyId: existing.lobbyId,
    roomCode: existing.lobby.roomCode,
    gameCancelled: result.gameCancelled,
  };
};

/**
 * Asserts that a user is not currently in any lobby.
 * @param tx
 * @param userId
 */
export const assertUserNotInLobby = async (tx: Tx, userId: string) => {
  const existing = await tx.query.lobbyPlayers.findFirst({
    where: eq(lobbyPlayers.userId, userId),
    with: {
      lobby: true,
    },
  });

  if (existing) {
    throw new AppError(
      400,
      `Already in a lobby. Room code: ${existing.lobby.roomCode}`,
      ErrorTypes.PLAYER_ALREADY_IN_LOBBY,
    );
  }
};

/**
 * Sets the ready status of a player in a lobby. This function ensures that the lobby is still in the "WAITING" state before allowing the change.
 * @param lobbyId
 * @param userId
 * @param isReady
 * @returns The updated lobby state after the player's ready status has been changed.
 */
export const setPlayerReady = async (
  lobbyId: string,
  userId: string,
  isReady: boolean,
) => {
  return await db.transaction(async (tx) => {
    // 1. Update the player's ready status in the lobbyPlayers table, ensuring the lobby is still in the "WAITING" state
    const result = await tx.execute(
      sql`
        UPDATE lobby_players
        SET is_ready = ${isReady}
        WHERE lobby_id = ${lobbyId}
          AND user_id = ${userId}
          AND EXISTS (
            SELECT 1 FROM lobbies WHERE id = ${lobbyId} AND status = 'WAITING'
          )
        RETURNING lobby_id
      `,
    );

    if (!result.rowCount) {
      throw new AppError(
        400,
        "Cannot set ready status — lobby not found, game in progress, or player not in lobby",
        ErrorTypes.LOBBY_NOT_FOUND,
      );
    }
    // 2. Fetch the updated lobby state with players to return
    const lobby = await getLobbyWithPlayers(tx, lobbyId);
    return lobby;
  });
};
