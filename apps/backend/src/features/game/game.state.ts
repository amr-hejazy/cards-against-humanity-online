import { AppError, ErrorTypes } from "../../core/error/errors";
import { GameState } from "./game.types";

const gameStates = new Map<string, GameState>();
const userIdToGamePlayerId = new Map<string, string>();
const userIdToGameId = new Map<string, string>();
const gameLocks = new Map<string, Promise<void>>();
const gameLocksInProgress = new Set<string>();

/**
 * Serializes concurrent async operations for the same game.
 * Prevents race conditions on in-memory GameState mutations.
 */
export const withGameLock = async <T>(
  gameId: string,
  fn: () => Promise<T>,
): Promise<T> => {
  // Create a new promise that will be resolved when the current operation is done
  let nextResolve: () => void;
  // basically, we are creating a queue of promises for each gameId. Each time withGameLock is called, it adds a new promise to the queue. The current operation waits for the previous one to finish before executing.
  const next = new Promise<void>((resolve) => {
    nextResolve = resolve;
  });

  // Get the current promise for this gameId, or a resolved promise if none exists
  const current = gameLocks.get(gameId) ?? Promise.resolve();
  // Set the next promise in the queue for this gameId
  gameLocks.set(
    gameId,
    current.then(() => next!),
  );

  // Wait for the current promise to resolve before executing the function
  await current;
  gameLocksInProgress.add(gameId);
  try {
    return await fn();
  } finally {
    gameLocksInProgress.delete(gameId);
    nextResolve!();
    if (gameLocks.get(gameId) === next) {
      gameLocks.delete(gameId);
    }
  }
};

export const requireGameLock = (gameId: string): void => {
  if (!gameLocksInProgress.has(gameId)) {
    throw new AppError(
      500,
      "Operation requires withGameLock — call withGameLock(gameId, ...) before invoking this function",
      ErrorTypes.INVALID_STATE,
    );
  }
};

export const createGameState = (state: GameState) => {
  gameStates.set(state.gameId, state);
  for (const [gamePlayerId, player] of state.players) {
    userIdToGamePlayerId.set(player.userId, gamePlayerId);
    userIdToGameId.set(player.userId, state.gameId);
  }
};

export const getGameState = (gameId: string) => {
  const state = gameStates.get(gameId);

  if (!state) {
    throw new AppError(404, "Game state not found", ErrorTypes.GAME_NOT_FOUND);
  }

  return state;
};

export const deleteGameState = (gameId: string) => {
  const state = gameStates.get(gameId);
  if (state) {
    for (const player of state.players.values()) {
      userIdToGamePlayerId.delete(player.userId);
      userIdToGameId.delete(player.userId);
    }
  }
  gameStates.delete(gameId);
};

export const resolveGamePlayerId = (userId: string): string | undefined => {
  return userIdToGamePlayerId.get(userId);
};

export const removeGamePlayerMappings = (userId: string) => {
  userIdToGamePlayerId.delete(userId);
  userIdToGameId.delete(userId);
};

export const findActiveGameByUserId = (userId: string): string | undefined => {
  const gameId = userIdToGameId.get(userId);
  if (!gameId) return undefined;
  if (!gameStates.has(gameId)) {
    removeGamePlayerMappings(userId);
    return undefined;
  }
  return gameId;
};

export const findGameByGameId = (gameId: string): GameState | undefined => {
  return gameStates.get(gameId);
};

export const findGameByLobbyId = (lobbyId: string): GameState | undefined => {
  for (const state of gameStates.values()) {
    if (state.lobbyId === lobbyId) return state;
  }
  return undefined;
};

export const clearAllGameStates = () => {
  gameStates.clear();
  userIdToGamePlayerId.clear();
  userIdToGameId.clear();
  gameLocks.clear();
};
