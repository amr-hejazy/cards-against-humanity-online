import { getSocket } from "../socket";

export function castVote(gameId: string, chosenGamePlayerId: string) {
  getSocket()?.emit("game:vote", { gameId, chosenGamePlayerId });
}

export function submitCard(gameId: string, cardIds: number[]) {
  getSocket()?.emit("game:submit", { gameId, cardIds });
}

export function judgeSubmission(gameId: string, winnerGamePlayerId: string) {
  getSocket()?.emit("game:judgeSubmission", { gameId, winnerGamePlayerId });
}

export function pickWhiteCards(_cardIds: number[]) {}

export function leaveGame(gameId: string) {
  getSocket()?.emit("game:leave", { gameId });
}

export function resetGame(lobbyId: string) {
  getSocket()?.emit("game:reset", { lobbyId });
}
