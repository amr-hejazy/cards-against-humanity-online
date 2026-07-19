import type { GameState, GamePlayerState, GameRoundState } from "../../../../src/features/game/game.types";
import type { Card } from "@cah/shared";

export function createMockGameState(
  playerCount: number,
  overrides?: { judgeGamePlayerId?: string; whiteDeck?: Card[] },
): GameState {
  const players = new Map<string, GamePlayerState>();
  const gamePlayerOrder: string[] = [];

  for (let i = 0; i < playerCount; i++) {
    const id = `gp-${i}`;
    players.set(id, {
      gamePlayerId: id,
      userId: `user-${i}`,
      username: `Player ${i}`,
      playerOrder: i + 1,
      score: 0,
      hand: [
        { id: 100 + i * 10 + 1, type: "WHITE", text: "card a", pick: null },
        { id: 100 + i * 10 + 2, type: "WHITE", text: "card b", pick: null },
      ],
    });
    gamePlayerOrder.push(id);
  }

  const whiteDeck: Card[] = overrides?.whiteDeck ?? [
    { id: 1, type: "WHITE", text: "Deck card 1", pick: null },
    { id: 2, type: "WHITE", text: "Deck card 2", pick: null },
    { id: 3, type: "WHITE", text: "Deck card 3", pick: null },
  ];

  return {
    gameId: "game-1",
    lobbyId: "lobby-1",
    roomCode: "ABC123",
    whiteDeck,
    blackDeck: [{ id: 10, type: "BLACK", text: "_____ is better than _____", pick: 2 }],
    discardPile: [],
    players,
    gamePlayerOrder,
    currentRound: {
      id: "round-1",
      number: 1,
      judgeGamePlayerId: overrides?.judgeGamePlayerId ?? "gp-0",
      blackCard: { id: 10, type: "BLACK", text: "_____ is better than _____", pick: 2 },
      submissions: {},
      status: "PLAYING",
    },
    winnerReveal: null,
    winningScore: 5,
    maxRounds: 3,
    gameMode: "rando_cardrissian",
    selectedPackIds: null,
    blankCardsEnabled: false,
    nextBlankId: -1,
    timedRoundsEnabled: false,
    nextWinnerCzarEnabled: false,
    roundTimeoutSeconds: 60,
    modeState: { modeName: "rando_cardrissian" },
    modeConfig: {},
  };
}
