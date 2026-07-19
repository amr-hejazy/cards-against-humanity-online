import type { GameMode } from "../lobby/lobby.dto";

export type CreateLobbyPayload = {
  maxPlayers: number;
};

export type JoinLobbyPayload = {
  roomCode: string;
};

export type LeaveLobbyPayload = {
  roomCode: string;
};

export type GetLobbyPayload = {
  roomCode: string;
};

export type SetPlayerReadyPayload = {
  isReady: boolean;
};

export type StartGamePayload = {
  roomCode: string;
  gameMode?: GameMode;
};

export type JoinGamePayload = {
  gameId: string;
};

export type SubmitCardsPayload = {
  gameId: string;
  whiteCardIds: number[];
  customTexts?: Record<string, string>;
};

export type JudgeSubmissionPayload = {
  gameId: string;
  winningGamePlayerId: string;
};

export type StartNextRoundPayload = {
  gameId: string;
};

export type CastVotePayload = {
  gameId: string;
  chosenGamePlayerId: string;
};

export type AddBotPayload = {
  roomCode: string;
};

export type RemoveBotPayload = {
  roomCode: string;
  botUserId: string;
};

export type UpdateLobbySettingsPayload = {
  roomCode: string;
  winningScore?: number;
  maxRounds?: number;
  gameMode?: GameMode;
  modeConfig?: Record<string, unknown>;
  selectedPackIds?: number[] | null;
  houseRules?: string[];
  roundTimeoutSeconds?: number;
};
