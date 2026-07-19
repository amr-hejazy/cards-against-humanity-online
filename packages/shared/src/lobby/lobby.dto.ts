export type LobbyPlayerDto = {
  userId: string;
  username: string;
  isReady: boolean;
  isBot?: boolean;
};

export type LobbyStatus = "WAITING" | "IN_PROGRESS";

export type GameMode = "normal" | "blank_only" | "rando_cardrissian" | "czar_is_dead";

export type VotingStyle = "czar_votes" | "all_votes";

export type LobbyDto = {
  id: string;
  roomCode: string;
  hostUserId: string;
  maxPlayers: number;
  status: LobbyStatus;
  gameId: string | null;
  winningScore: number;
  maxRounds: number;
  gameMode: GameMode;
  modeConfig: Record<string, unknown>;
  selectedPackIds: number[] | null;
  houseRules: string[];
  roundTimeoutSeconds: number;
  players: LobbyPlayerDto[];
};
