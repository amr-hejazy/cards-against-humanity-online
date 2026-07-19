import { randomUUID } from "node:crypto";

export type BotPlayer = {
  userId: string;
  username: string;
  lobbyId: string;
};

const store = new Map<string, Map<string, BotPlayer>>();

const BOT_NAMES = [
  "Bender",
  "HAL 9000",
  "GLaDOS",
  "Data",
  "Marvin",
  "Optimus",
  "Baymax",
  "Ava",
  "Johnny 5",
  "R2-D2",
  "C-3PO",
  "Sonny",
  "WALL-E",
  "T-800",
  "Agent Smith",
  "KITT",
  "RoboCop",
  "TARS",
  "Chappie",
  "Bishop",
  "Ash",
  "ED-209",
  "Bumblebee",
  "Megatron",
  "Iron Giant",
  "Ultron",
  "Vision",
  "Jarvis",
  "Cortana",
  "Samantha",
  "EVE",
  "Baymax",
  "K-2SO",
  "BB-8",
  "D-O",
  "IG-11",
  "L3-37",
  "Chitti",
  "Sonny",
  "T-1000",
  "T-3000",
  "T-X",
  "RoboCop 2",
  "RoboCop 3",
  "Johnny 5.2",
  "Johnny 5.3",
  "Johnny 5.4",
  "RoboCop Prime Directives",
  "RoboCop: The Series RoboCop 2.0",
  "RoboCop: I didn't watch RoboCop",
];

function generateBotName(existingNames: Set<string>): string {
  for (const name of BOT_NAMES) {
    if (!existingNames.has(name)) return name;
  }
  return `Bot-${randomUUID().slice(0, 8)}`;
}

export const lobbyBots = {
  addBot(lobbyId: string): BotPlayer {
    let inner = store.get(lobbyId);
    if (!inner) {
      inner = new Map();
      store.set(lobbyId, inner);
    }
    const existing = new Set<string>();
    for (const bot of inner.values()) {
      existing.add(bot.username);
    }
    const userId = randomUUID();
    const username = generateBotName(existing);
    const bot: BotPlayer = { userId, username, lobbyId };
    inner.set(userId, bot);
    return bot;
  },

  removeBot(lobbyId: string, botUserId: string): void {
    const inner = store.get(lobbyId);
    if (inner) {
      inner.delete(botUserId);
      if (inner.size === 0) store.delete(lobbyId);
    }
  },

  getBots(lobbyId: string): BotPlayer[] | undefined {
    const inner = store.get(lobbyId);
    return inner ? [...inner.values()] : undefined;
  },

  clearLobby(lobbyId: string): void {
    store.delete(lobbyId);
  },

  clearAll(): void {
    store.clear();
  },
};
