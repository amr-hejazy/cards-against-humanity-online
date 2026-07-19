import type { LobbyDto, GameMode } from "@cah/shared";
import type { BotPlayer } from "../../core/game/lobby-bot.state";
import { LobbyWithPlayers } from "./lobby.types";

export const toLobbyDto = (
  lobby: LobbyWithPlayers,
  gameId: string | null,
  bots?: BotPlayer[],
): LobbyDto => {
  const players: {
    userId: string;
    username: string;
    isReady: boolean;
    isBot?: boolean;
  }[] = lobby.players.map((player) => ({
    userId: player.userId,
    username: player.user?.username ?? "Unknown",
    isReady: player.isReady,
  }));

  if (bots) {
    for (const bot of bots) {
      players.push({
        userId: bot.userId,
        username: bot.username,
        isReady: true,
        isBot: true,
      });
    }
  }

  return {
    id: lobby.id,
    roomCode: lobby.roomCode,
    hostUserId: lobby.hostId,
    maxPlayers: lobby.maxPlayers,
    status: lobby.status,
    gameId,
    winningScore: lobby.winningScore,
    maxRounds: lobby.maxRounds,
    gameMode: lobby.gameMode as GameMode,
    modeConfig: lobby.modeConfig ?? {},
    selectedPackIds: lobby.selectedPackIds,
    houseRules: lobby.houseRules ?? [],
    roundTimeoutSeconds: lobby.roundTimeoutSeconds,
    players,
  };
};
