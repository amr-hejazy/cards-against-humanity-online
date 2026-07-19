import { eq, and, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { lobbyPlayers, lobbies, games, cardPacks } from "../../db/schema";
import { AppError, ErrorTypes } from "../../core/error/errors";
import { MIN_PLAYERS, DEFAULT_MAX_ROUNDS } from "@cah/shared";
import type { GameMode } from "@cah/shared";
import {
  findGameByLobbyId,
  deleteGameState,
  withGameLock,
  resolveGamePlayerId,
} from "../game/game.state";
import { removePlayerFromGame } from "../game/game.service";
import type { LobbyWithPlayers } from "./lobby.types";
import {
  assertUserNotInLobby,
  generateUniqueRoomCode,
  getLobbyWithPlayers,
} from "./lobby.helpers";

/**
 * Create a new game lobby with the given host user ID and maximum number of players. (Max players can be modified later by the host user.)
 * @param hostUserId
 * @param maxPlayers
 * @returns The created lobby state.
 */
export async function createLobby(hostUserId: string, maxPlayers: number) {
  // 0. Validate maxPlayers is within the allowed range (3-10)
  if (maxPlayers < 3 || maxPlayers > 10) {
    throw new AppError(
      400,
      "Max players must be between 3 and 10",
      ErrorTypes.LOBBY_SIZE_INVALID,
    );
  }

  // Wrapped in a transaction to ensure atomicity of lobby creation and player insertion
  return db.transaction(async (tx) => {
    // 1. Ensure the host user is not already in a lobby
    await assertUserNotInLobby(tx, hostUserId);
    // 2. Generate a unique room code for the lobby
    const roomCode = await generateUniqueRoomCode(tx);

    // 3. Insert the new lobby into the database
    const [lobby] = await tx
      .insert(lobbies)
      .values({
        hostId: hostUserId,
        status: "WAITING",
        roomCode,
        maxPlayers,
        winningScore: 5,
        maxRounds: DEFAULT_MAX_ROUNDS,
        gameMode: "normal" as GameMode,
        selectedPackIds: null,
        houseRules: [],
        roundTimeoutSeconds: 60,
      })
      .returning();

    // 4. Insert the host user into the lobbyPlayers table (a.k.a joining the room)
    await tx.insert(lobbyPlayers).values({
      lobbyId: lobby.id,
      userId: hostUserId,
    });

    // 5. Return the created lobby
    const lobbyWithPlayers = await getLobbyWithPlayers(tx, lobby.id);
    return lobbyWithPlayers;
  });
}

/**
 * Joins a user to an existing game lobby.
 * @param roomCode
 * @param userId
 * @returns The lobby state after the user has joined.
 */
export const joinLobby = async (roomCode: string, userId: string) => {
  // Pre-check: ensure user isn't already in a DIFFERENT lobby
  const existing = await db.query.lobbyPlayers.findFirst({
    where: eq(lobbyPlayers.userId, userId),
    with: { lobby: true },
  });
  if (existing && existing.lobby.roomCode !== roomCode) {
    throw new AppError(
      400,
      `Already in a lobby. Room code: ${existing.lobby.roomCode}`,
      ErrorTypes.PLAYER_ALREADY_IN_LOBBY,
    );
  }

  // Wrapped in a transaction to ensure atomicity of lobby joining and player insertion
  return await db.transaction(async (tx) => {
    // 1. Find the lobby
    const lobby = await tx.query.lobbies.findFirst({
      where: eq(lobbies.roomCode, roomCode),
    });

    if (!lobby) {
      throw new AppError(404, "Lobby not found", ErrorTypes.LOBBY_NOT_FOUND);
    }

    // 2. Get current players
    const players = await tx.query.lobbyPlayers.findMany({
      where: eq(lobbyPlayers.lobbyId, lobby.id),
    });

    // 3. If user already in this lobby → rejoin (return state, no insert)
    // Must check before status check — allows rejoining after server restart
    // when lobby is still IN_PROGRESS in DB but in-memory game state is gone.
    if (players.some((player) => player.userId === userId)) {
      const lobbyWithPlayers = await getLobbyWithPlayers(tx, lobby.id);
      return lobbyWithPlayers;
    }

    // 4. Verify lobby is joinable
    if (lobby.status !== "WAITING") {
      throw new AppError(
        400,
        "Lobby is already in progress and cannot be joined",
        ErrorTypes.LOBBY_NOT_JOINABLE,
      );
    }

    // 5. Verify lobby isn't full
    if (players.length >= lobby.maxPlayers) {
      throw new AppError(400, "Lobby is full", ErrorTypes.LOBBY_FULL);
    }

    // 6. Add user
    await tx.insert(lobbyPlayers).values({
      lobbyId: lobby.id,
      userId,
    });

    // 7. Return lobby
    const lobbyWithPlayers = await getLobbyWithPlayers(tx, lobby.id);
    return lobbyWithPlayers;
  });
};

/**
 * Leaves an existing game lobby.
 * @param roomCode
 * @param userId
 * @returns The lobby state after the user has left, or an indicator that the lobby was deleted.
 */

export const leaveLobby = async (roomCode: string, userId: string) => {
  let gameIdToDelete: string | null = null;
  let gameCancelled = false;

  // Wrapped in a transaction to ensure atomicity of lobby leaving and player deletion
  const result = await db.transaction(async (tx) => {
    // 1. Find the lobby
    const lobby = await tx.query.lobbies.findFirst({
      where: eq(lobbies.roomCode, roomCode),
    });

    if (!lobby) {
      throw new AppError(404, "Lobby not found", ErrorTypes.LOBBY_NOT_FOUND);
    }

    // 2. ensure the user is actually in the lobby
    const player = await tx.query.lobbyPlayers.findFirst({
      where: and(
        eq(lobbyPlayers.lobbyId, lobby.id),
        eq(lobbyPlayers.userId, userId),
      ),
    });

    if (!player) {
      throw new AppError(
        404,
        "Player not found in lobby",
        ErrorTypes.PLAYER_NOT_FOUND,
      );
    }

    // 3. Remove the user from the lobby
    await tx
      .delete(lobbyPlayers)
      .where(
        and(
          eq(lobbyPlayers.lobbyId, lobby.id),
          eq(lobbyPlayers.userId, userId),
        ),
      );

    const remainingPlayers = await tx.query.lobbyPlayers.findMany({
      where: eq(lobbyPlayers.lobbyId, lobby.id),
    });

    // 4. if there are no more players, delete the lobby and any associated game state
    if (remainingPlayers.length === 0) {
      await tx.delete(games).where(eq(games.lobbyId, lobby.id));
      const gameState = findGameByLobbyId(lobby.id);
      if (gameState) {
        gameIdToDelete = gameState.gameId;
      }
      await tx.delete(lobbies).where(eq(lobbies.id, lobby.id));
      return { lobby: null as LobbyWithPlayers | null, gameCancelled: true };
    }
    // 4a. If the leaving user was the host, assign a new host (first remaining player)
    if (lobby.hostId === userId) {
      const newHost = remainingPlayers[0];
      await tx
        .update(lobbies)
        .set({ hostId: newHost.userId })
        .where(eq(lobbies.id, lobby.id));
    }
    // 4b. If the lobby is in progress, check if the game should be cancelled or if the player should be removed from the game
    if (lobby.status === "IN_PROGRESS") {
      // find the game state for this lobby
      const gameState = findGameByLobbyId(lobby.id);
      if (gameState) {
        const botsCount = [...gameState.players.values()].filter(
          (p) => p.isBot,
        ).length;
        const remainingPlayerCount = remainingPlayers.length + botsCount;
        // If the remaining players are above the minimum required, remove the player from the game and return the updated lobby state.
        if (remainingPlayerCount >= MIN_PLAYERS) {
          const gpId = resolveGamePlayerId(userId);
          if (gpId) {
            await withGameLock(gameState.gameId, () =>
              removePlayerFromGame(gameState, gpId),
            );
          }
          const lobbyAfterUpdate = await getLobbyWithPlayers(tx, lobby.id);
          return { lobby: lobbyAfterUpdate, gameCancelled: false };
        } else {
          // if the remaining players are below the minimum required, cancel the game and delete the game state
          await tx
            .update(lobbies)
            .set({ status: "WAITING" })
            .where(eq(lobbies.id, lobby.id));
          await tx
            .delete(games)
            .where(
              and(eq(games.lobbyId, lobby.id), eq(games.status, "IN_PROGRESS")),
            );
          if (gameState) {
            gameIdToDelete = gameState.gameId;
            gameCancelled = true;
          }
          const lobbyAfterUpdate = await getLobbyWithPlayers(tx, lobby.id);
          return { lobby: lobbyAfterUpdate, gameCancelled: true };
        }
      }
    }

    const lobbyAfterUpdate = await getLobbyWithPlayers(tx, lobby.id);
    return { lobby: lobbyAfterUpdate, gameCancelled: false };
  });

  if (gameIdToDelete) {
    const gameId: string = gameIdToDelete;
    await withGameLock(gameId, async () => {
      deleteGameState(gameId);
    });
  }

  return result;
};

/**
 * Retrieves the state of a game lobby.
 * @param roomCode
 * @returns The lobby state or an error if not found
 */
export const getLobby = async (roomCode: string) => {
  const lobby = await db.query.lobbies.findFirst({
    where: eq(lobbies.roomCode, roomCode),
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
 * Updates host-configurable lobby settings (win condition, game mode, card packs).
 * Validates the requesting user is the host and the lobby is still in the WAITING state,
 * validates selected pack IDs against the card_packs table, then persists the changes.
 * @param lobbyId
 * @param userId - the requesting user (must be host)
 * @param payload - partial settings to apply
 * @returns The updated lobby state with players.
 */
export const updateLobbySettings = async (
  lobbyId: string,
  userId: string,
    payload: {
    winningScore?: number;
    maxRounds?: number;
    gameMode?: GameMode;
    modeConfig?: Record<string, unknown>;
    selectedPackIds?: number[] | null;
    houseRules?: string[];
    roundTimeoutSeconds?: number;
  },
) => {
  return db.transaction(async (tx) => {
    // 1. Fetch current lobby to validate host and game status
    const lobby = await tx.query.lobbies.findFirst({
      where: eq(lobbies.id, lobbyId),
    });
    if (!lobby) {
      throw new AppError(404, "Lobby not found", ErrorTypes.LOBBY_NOT_FOUND);
    }
    if (lobby.hostId !== userId) {
      throw new AppError(
        403,
        "Only the host can change settings",
        ErrorTypes.NOT_HOST,
      );
    }
    if (lobby.status !== "WAITING") {
      throw new AppError(
        400,
        "Cannot change settings during game",
        ErrorTypes.LOBBY_NOT_JOINABLE,
      );
    }

    // 2. Validate selectedPackIds against the card_packs table
    if (payload.selectedPackIds !== undefined && payload.selectedPackIds !== null) {
      const validIds = await tx
        .select({ id: cardPacks.id })
        .from(cardPacks)
        .where(inArray(cardPacks.id, payload.selectedPackIds));
      if (validIds.length !== payload.selectedPackIds.length) {
        throw new AppError(
          400,
          "Invalid pack IDs",
          ErrorTypes.VALIDATION_ERROR,
        );
      }
    }

    // 3. If mode is czar_is_dead, strip incompatible house rules
    let updatedHouseRules = payload.houseRules;
    if (payload.gameMode === "czar_is_dead") {
      const current = updatedHouseRules ?? lobby.houseRules;
      updatedHouseRules = current.filter((r: string) => r !== "next_winner_czar");
    }

    // 4. Apply only the provided fields
    const [updated] = await tx
      .update(lobbies)
      .set({
        ...(payload.winningScore !== undefined && {
          winningScore: payload.winningScore,
        }),
        ...(payload.maxRounds !== undefined && {
          maxRounds: payload.maxRounds,
        }),
        ...(payload.gameMode !== undefined && {
          gameMode: payload.gameMode,
        }),
        ...(payload.modeConfig !== undefined && {
          modeConfig: payload.modeConfig,
        }),
        ...(payload.selectedPackIds !== undefined && {
          selectedPackIds: payload.selectedPackIds,
        }),
        ...((payload.houseRules !== undefined || payload.gameMode === "czar_is_dead") && {
          houseRules: updatedHouseRules,
        }),
        ...(payload.roundTimeoutSeconds !== undefined && {
          roundTimeoutSeconds: payload.roundTimeoutSeconds,
        }),
        updatedAt: new Date(),
      })
      .where(eq(lobbies.id, lobbyId))
      .returning();

    return getLobbyWithPlayers(tx, updated.id);
  });
};
