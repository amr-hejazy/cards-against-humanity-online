export type {
  LobbyPlayerDto,
  LobbyStatus,
  LobbyDto,
  GameMode,
  VotingStyle,
} from "./lobby/lobby.dto";

export type { PackInfo } from "./lobby/packs.dto";

export type {
  PlayerDto,
  PublicRoundDto,
  PublicGameStateDto,
  WinnerRevealDto,
  PrivatePlayerDto,
  PlayerGameStateDto,
  VoteUpdateDto,
} from "./game/lobby.dto";

export type {
  Card,
  EndGameResults,
} from "./game/types";

export type {
  GuestResponseDTO,
  UserDTO,
  UserResponseDTO,
} from "./auth/auth.dto";

export type {
  CreateLobbyPayload,
  JoinLobbyPayload,
  LeaveLobbyPayload,
  GetLobbyPayload,
  SetPlayerReadyPayload,
  StartGamePayload,
  JoinGamePayload,
  SubmitCardsPayload,
  JudgeSubmissionPayload,
  StartNextRoundPayload,
  CastVotePayload,
  AddBotPayload,
  RemoveBotPayload,
  UpdateLobbySettingsPayload,
} from "./socket/types";

export type { ErrorType } from "./errors";
export { ErrorTypes } from "./errors";

export {
  MIN_PLAYERS,
  STARTING_HAND_SIZE,
  DEFAULT_WINNING_SCORE,
  DEFAULT_MAX_ROUNDS,
  DEFAULT_GAME_MODE,
  DEFAULT_ROUND_TIMEOUT_SECONDS,
  AUTO_ADVANCE_MS,
  BOT_AUTO_ADVANCE_MS,
} from "./constants";
