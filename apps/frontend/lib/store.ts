import { create } from "zustand";
import { disconnectSocket } from "./socket";
import { castVote } from "./action/game-actions";
import type {
  LobbyPlayerDto,
  LobbyStatus,
  LobbyDto,
  PlayerDto,
  PublicGameStateDto,
  PlayerGameStateDto,
  WinnerRevealDto,
  EndGameResults as EndGameResultsDto,
} from "@cah/shared";

export type {
  LobbyPlayerDto,
  LobbyStatus,
  LobbyDto,
  PlayerDto,
  PublicGameStateDto,
  PlayerGameStateDto,
  WinnerRevealDto,
  EndGameResultsDto,
};

// Define the state structure for the application
type AppState = {
  token: string | null;
  userId: string | null;
  username: string | null;
  lobby: LobbyDto | null;
  gameId: string | null;
  gameState: PlayerGameStateDto | null;
  endGameResults: EndGameResultsDto | null;
  winnerReveal: WinnerRevealDto | null;
  lobbyRoomCode: string | null;
  disconnectedPlayer: string | null;
  hasSetUsername: boolean;
  setAuth: (token: string, userId: string, username: string, hasSetUsername?: boolean) => void;
  setLobby: (lobby: LobbyDto | null) => void;
  setGameId: (gameId: string | null) => void;
  setGameState: (gameState: PlayerGameStateDto | null) => void;
  setEndGameResults: (endGameResults: EndGameResultsDto | null) => void;
  setWinnerReveal: (winnerReveal: WinnerRevealDto | null) => void;
  setLobbyRoomCode: (roomCode: string | null) => void;
  setDisconnectedPlayer: (username: string | null) => void;
  voteTargets: string[] | null;
  voterGamePlayerId: string | null;
  hasVoted: boolean;
  voteProgress: { submittedVotes: number; totalVoters: number } | null;
  selectedVoteTarget: string | null;
  setVoteTargets: (targets: string[] | null) => void;
  setVoterGamePlayerId: (id: string | null) => void;
  setHasVoted: (voted: boolean) => void;
  setVoteProgress: (progress: { submittedVotes: number; totalVoters: number } | null) => void;
  setSelectedVoteTarget: (target: string | null) => void;
  castVote: (gameId: string, chosenGamePlayerId: string) => void;
  socketConnected: boolean;
  setSocketConnected: (connected: boolean) => void;
  reset: () => void;
};

const PERSIST_KEY = "cah-auth";
const LOBBY_KEY = "cah-lobby";

const loadPersistedAuth = () => {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

const loadPersistedLobby = () => {
  try {
    const raw = localStorage.getItem(LOBBY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

const persisted = loadPersistedAuth();
const persistedLobby = loadPersistedLobby();

// Create the Zustand store with initial state and actions
export const useStore = create<AppState>((set) => ({
  token: persisted?.token ?? null,
  userId: persisted?.userId ?? null,
  username: persisted?.username ?? null,
  lobby: null,
  gameId: null,
  gameState: null,
  endGameResults: null,
  winnerReveal: null,
  lobbyRoomCode: persistedLobby?.roomCode ?? null,
  disconnectedPlayer: null,
  voteTargets: null,
  voterGamePlayerId: null,
  hasVoted: false,
  voteProgress: null,
  selectedVoteTarget: null,
  hasSetUsername: persisted?.hasSetUsername ?? false,
  socketConnected: true,
  setSocketConnected: (connected) => set({ socketConnected: connected }),
  setAuth: (token, userId, username, hasSetUsername = false) => {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({ token, userId, username, hasSetUsername }),
    );
    set({ token, userId, username, hasSetUsername });
  },
  setLobby: (lobby) => set({ lobby }),
  setGameId: (gameId) => set({ gameId }),
  setGameState: (gameState) => set({ gameState }),
  setEndGameResults: (endGameResults) => set({ endGameResults }),
  setWinnerReveal: (winnerReveal) => set({ winnerReveal }),
  setLobbyRoomCode: (roomCode) => {
    if (roomCode) {
      localStorage.setItem(LOBBY_KEY, JSON.stringify({ roomCode }));
    } else {
      localStorage.removeItem(LOBBY_KEY);
    }
    set({ lobbyRoomCode: roomCode });
  },
  setDisconnectedPlayer: (username) => set({ disconnectedPlayer: username }),
  setVoteTargets: (targets) => set({ voteTargets: targets }),
  setVoterGamePlayerId: (id) => set({ voterGamePlayerId: id }),
  setHasVoted: (voted) => set({ hasVoted: voted }),
  setVoteProgress: (progress) => set({ voteProgress: progress }),
  setSelectedVoteTarget: (target) => set({ selectedVoteTarget: target }),
  castVote: (gameId, chosenGamePlayerId) => {
    castVote(gameId, chosenGamePlayerId);
  },
  reset: () => {
    localStorage.removeItem(PERSIST_KEY);
    localStorage.removeItem(LOBBY_KEY);
    disconnectSocket();
    set({
      token: null,
      userId: null,
      username: null,
      lobby: null,
      gameId: null,
      gameState: null,
      endGameResults: null,
      winnerReveal: null,
      lobbyRoomCode: null,
      disconnectedPlayer: null,
      voteTargets: null,
      voterGamePlayerId: null,
      hasVoted: false,
      voteProgress: null,
      selectedVoteTarget: null,
      hasSetUsername: false,
      socketConnected: false,
    });
  },
}));
