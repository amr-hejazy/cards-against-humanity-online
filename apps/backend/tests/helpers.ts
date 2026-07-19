import { db } from "../src/db/client";
import { users } from "../src/db/schema";
import {
  createLobby,
  joinLobby,
} from "../src/features/lobby/lobby.service";
import { setPlayerReady } from "../src/features/lobby/lobby.helpers";
import { startGame } from "../src/features/game/game.service";
import type { Card } from "@cah/shared";
import { GameState } from "../src/features/game/game.types";

export const createTestUser = async (): Promise<{
  id: string;
  username: string;
}> => {
  const username = `test_${Math.random().toString(36).slice(2, 10)}`;
  const [user] = await db.insert(users).values({ username }).returning();
  return { id: user.id, username: user.username };
};

export const setupLobbyWithPlayers = async (
  count: number,
): Promise<{
  users: { id: string; username: string }[];
  lobby: any;
  roomCode: string;
}> => {
  const testUsers: { id: string; username: string }[] = [];
  for (let i = 0; i < count; i++) {
    testUsers.push(await createTestUser());
  }

  const lobby = await createLobby(testUsers[0].id, count);
  const roomCode = lobby.roomCode;

  for (let i = 1; i < count; i++) {
    await joinLobby(roomCode, testUsers[i].id);
  }

  for (const user of testUsers) {
    await setPlayerReady(lobby.id, user.id, true);
  }

  return { users: testUsers, lobby, roomCode };
};

export const getNonJudgePlayerIds = (state: GameState): string[] => {
  const judgeId = state.currentRound!.judgeGamePlayerId;
  return [...state.players.keys()].filter((id) => id !== judgeId);
};

export const pickCardsForSubmission = (
  state: GameState,
  gamePlayerId: string,
): number[] => {
  const player = state.players.get(gamePlayerId);
  if (!player) throw new Error(`Player ${gamePlayerId} not found`);

  const pick = state.currentRound!.blackCard.pick ?? 1;
  return player.hand.slice(0, pick).map((c: Card) => c.id);
};

export const startAndGetGame = async (
  roomCode: string,
  hostUserId: string,
) => {
  const { state } = await startGame(roomCode, hostUserId);
  return state;
};
