export const gamePlayerSockets = new Map<string, Set<string>>();
export const socketIdToGamePlayerId = new Map<string, string>();
const autoAdvanceTimeouts = new Map<string, NodeJS.Timeout>();

export const getGamePlayerIdBySocketId = (socketId: string): string | undefined => {
  return socketIdToGamePlayerId.get(socketId);
};

export const cleanupGameSocketMapsForPlayer = (gamePlayerId: string) => {
  const sockets = gamePlayerSockets.get(gamePlayerId);
  if (sockets) {
    for (const sid of sockets) {
      socketIdToGamePlayerId.delete(sid);
    }
    gamePlayerSockets.delete(gamePlayerId);
  }
};

export const clearAutoAdvanceTimeout = (gameId: string) => {
  const existing = autoAdvanceTimeouts.get(gameId);
  if (existing) {
    clearTimeout(existing);
    autoAdvanceTimeouts.delete(gameId);
  }
};

export const setAutoAdvanceTimeout = (gameId: string, timeout: NodeJS.Timeout) => {
  autoAdvanceTimeouts.set(gameId, timeout);
};

const roundTimers = new Map<string, NodeJS.Timeout>();

export const setRoundTimer = (gameId: string, timeout: NodeJS.Timeout): void => {
  clearRoundTimer(gameId);
  roundTimers.set(gameId, timeout);
};

export const clearRoundTimer = (gameId: string): void => {
  const existing = roundTimers.get(gameId);
  if (existing) {
    clearTimeout(existing);
    roundTimers.delete(gameId);
  }
};
