export type Card = {
  id: number;
  type: "BLACK" | "WHITE";
  text: string;
  pick: number | null;
  isBlank?: boolean;
  customText?: string;
};

export type EndGameResults = {
  lobbyId: string;
  roomCode: string;
  winnerGamePlayerId: string | null;
  isTie: boolean;
  players: {
    gamePlayerId: string;
    userId: string;
    username: string;
    score: number;
  }[];
};
