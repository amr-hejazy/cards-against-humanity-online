export type Card = {
  id: number;
  type: "BLACK" | "WHITE";
  text: string;
  pick: number | null;
  isBlank?: boolean;
  customText?: string;
};

export type PlayerDto = {
  gamePlayerId: string;
  userId: string;
  username: string;
  playerOrder: number;
  score: number;
  submitted: boolean;
  isBot?: boolean;
};

export type PublicRoundDto = {
  id: string;
  number: number;
  judgeGamePlayerId: string;
  blackCard: Card;
  status: "PLAYING" | "VOTING" | "REVEAL" | "FINISHED";
  submittedCount: number;
  submissions: {
    gamePlayerId: string;
    cards: Card[];
  }[];
  roundStartedAt?: string;
  voteMode?: {
    voteTargets: string[];
    voterGamePlayerId: string;
    hasVoted: boolean;
  };
};

export type WinnerRevealDto = {
  winnerGamePlayerId: string;
  previousJudgeGamePlayerId: string;
  winnerUsername: string;
  pointsAwarded: number;
  autoAdvanceAt: string;
  winningCards: Card[];
  blackCard: Card;
  isFinalRound?: boolean;
  gameWinnerId?: string | null;
  endReason?: "winning_score_reached" | "max_rounds_reached";
  submissionDetails?: { gamePlayerId: string; username: string; cards: Card[]; votedBy?: string[] }[];
};

export type PublicGameStateDto = {
  gameId: string;
  players: PlayerDto[];
  currentRound: PublicRoundDto | null;
  winnerReveal: WinnerRevealDto | null;
  timedRoundsEnabled: boolean;
  roundTimeoutSeconds: number;
  gameMode: string;
  modeState: { modeName: string } | null;
  modeConfig: Record<string, unknown>;
};

export type PrivatePlayerDto = {
  gamePlayerId: string;
  userId: string;
  username: string;
  score: number;
  submitted: boolean;
  hand: Card[];
  isBot?: boolean;
};

export type VoteUpdateDto = {
  roundNumber: number;
  submittedVotes: number;
  totalVoters: number;
};

export type PlayerGameStateDto = {
  game: PublicGameStateDto;
  player: {
    hand: Card[];
  };
};