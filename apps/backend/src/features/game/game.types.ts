import type { Card, EndGameResults, GameMode, VotingStyle } from "@cah/shared";

export type GameModeState =
  | { modeName: "normal" }
  | { modeName: "blank_only"; votingStyle: VotingStyle }
  | { modeName: "rando_cardrissian" }
  | { modeName: "czar_is_dead" };

export type RoundResult =
  | { type: "normal"; winnerGpId: string; pointsAwarded: number }
  | { type: "no_winner"; pointsAwarded: 0 };

export type GameEndCheck = {
  ended: boolean;
  winnerGpId?: string | null;
  isTie?: boolean;
  reason?: "winning_score_reached" | "max_rounds_reached";
};

export type GamePlayerState = {
  gamePlayerId: string;
  userId: string;
  username: string;

  playerOrder: number;

  score: number;
  hand: Card[];
  isBot?: boolean;
};

export type SubmissionState = {
  gamePlayerId: string;
  cards: Card[];
  submittedAt: Date;
};

export type GameRoundState = {
  id: string;
  number: number;
  judgeGamePlayerId: string;
  blackCard: Card;
  submissions: Record<string, SubmissionState>; // key is gamePlayerId
  status: "PLAYING" | "VOTING" | "REVEAL";
  roundStartedAt?: Date;
};

export type WinnerRevealState = {
  winnerGamePlayerId: string;
  previousJudgeGamePlayerId: string;
  winnerUsername: string;
  pointsAwarded: number;
  autoAdvanceAt: Date;
  nextRoundNumber: number;
  winningCards: Card[];
  blackCard: Card;
  isFinalRound: boolean;
  gameWinnerId?: string | null;
  endReason?: "winning_score_reached" | "max_rounds_reached";
  submissionDetails?: { gamePlayerId: string; username: string; cards: Card[]; votedBy?: string[] }[];
};

export type GameState = {
  gameId: string;
  lobbyId: string;
  roomCode: string;

  whiteDeck: Card[];
  blackDeck: Card[];
  discardPile: Card[];

  players: Map<string, GamePlayerState>;
  gamePlayerOrder: string[];

  currentRound: GameRoundState | null;
  winnerReveal: WinnerRevealState | null;

  winningScore: number;
  maxRounds: number;
  gameMode: GameMode;
  selectedPackIds: number[] | null;
  blankCardsEnabled: boolean;
  nextBlankId: number;
  timedRoundsEnabled: boolean;
  nextWinnerCzarEnabled: boolean;
  roundTimeoutSeconds: number;

  modeState: GameModeState;
  modeConfig: Record<string, unknown>;
};

export type JudgeSubmissionResult =
  | {
      type: "ROUND_WINNER";
      state: GameState;
      winnerReveal: WinnerRevealState;
    }
  | {
      type: "GAME_ENDED";
      results: EndGameResults;
    }
  | {
      type: "NO_WINNER";
      state: GameState;
    };
