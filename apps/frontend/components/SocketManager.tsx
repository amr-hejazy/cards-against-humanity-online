import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { connectSocket, getSocket } from "../lib/socket";
import {
  useStore,
  type EndGameResultsDto,
  type PlayerGameStateDto,
  type LobbyDto,
} from "../lib/store";

export default function SocketManager() {
  // Access the token and various state setters from the Zustand store
  const token = useStore((s) => s.token);
  const setLobby = useStore((s) => s.setLobby);
  const setGameId = useStore((s) => s.setGameId);
  const setGameState = useStore((s) => s.setGameState);
  const setEndGameResults = useStore((s) => s.setEndGameResults);
  const setLobbyRoomCode = useStore((s) => s.setLobbyRoomCode);
  const setSocketConnected = useStore((s) => s.setSocketConnected);
  const setDisconnectedPlayer = useStore((s) => s.setDisconnectedPlayer);
  const setWinnerReveal = useStore((s) => s.setWinnerReveal);
  const setVoteTargets = useStore((s) => s.setVoteTargets);
  const setVoterGamePlayerId = useStore((s) => s.setVoterGamePlayerId);
  const setHasVoted = useStore((s) => s.setHasVoted);
  const setVoteProgress = useStore((s) => s.setVoteProgress);
  const setSelectedVoteTarget = useStore((s) => s.setSelectedVoteTarget);
  const navigate = useNavigate();
  const location = useLocation();
  const cancelTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    // If there's no token, we can't connect to the socket, so we return early
    if (!token) return;
    const socket = connectSocket(token);
    // Define event handlers for various socket events
    const onCreated = (lobby: LobbyDto) => {
      setLobby(lobby);
      setLobbyRoomCode(lobby.roomCode);
      navigate(`/lobby/${lobby.roomCode}`, { replace: true });
    };
    const onUpdated = (lobby: LobbyDto) => {
      setLobby(lobby);
      const onGamePage = window.location.pathname.startsWith("/game/");
      const onCorrectLobby = window.location.pathname === `/lobby/${lobby.roomCode}`;
      if (!onGamePage && !onCorrectLobby) {
        if (lobby.gameId) {
          navigate(`/game/${lobby.gameId}`, { replace: true });
        } else {
          navigate(`/lobby/${lobby.roomCode}`, { replace: true });
        }
      }
    };
    // When we receive the current lobby state, we update the store with it
    const onCurrent = (lobby: LobbyDto) => {
      setLobby(lobby);
      setLobbyRoomCode(lobby.roomCode);
      if (window.location.pathname === "/") {
        if (lobby.gameId) {
          navigate(`/game/${lobby.gameId}`, { replace: true });
        } else {
          navigate(`/lobby/${lobby.roomCode}`, { replace: true });
        }
      }
    };
    // When the lobby is deleted, we clear the lobby state and navigate back to the home page
    const onDeleted = () => {
      // Navigate first — don't clear lobby here or LobbyPage's effect
      // may re-run with stale roomCode and emit lobby:join (rejoin).
      navigate("/");
      setLobbyRoomCode(null);
    };
    const onLobbyError = (err: { action: string; message: string }) => {
      toast.error("ERROR", {
        description: err.message,
        id: "lobby-error-" + err.action,
        dismissible: true,
      });
      if (err.action === "get") {
        setLobbyRoomCode(null);
        navigate("/", { replace: true });
      }
      if (err.action === "join") {
        // If already in a different lobby, redirect there
        const match = err.message.match(/Room code: (\w+)/);
        if (match) {
          navigate(`/lobby/${match[1]}`, { replace: true });
        }
      }
    };
    const onGameError = (err: { action: string; message: string }) => {
      toast.error("ERROR", {
        description: err.message,
        id: "game-error-" + err.action,
        dismissible: true,
      });
      if (err.action === "join") navigate("/", { replace: true });
    };
    // When the game starts, we set the gameId in the store and navigate to the game page
    const onGameStarted = (payload: { gameId: string; roomCode: string }) => {
      setEndGameResults(null);
      setGameId(payload.gameId);
      setLobbyRoomCode(payload.roomCode);
      navigate(`/game/${payload.gameId}`);
    };
    // When the game state changes, we update the game state in the store
    const onGameStateChanged = (payload: PlayerGameStateDto) => {
      const store = useStore.getState();
      if (store.endGameResults) return; // Ignore stale state after game ended
      setGameState(payload);
      setWinnerReveal(payload.game.winnerReveal ?? null);
      if (payload.game.currentRound?.voteMode) {
        setVoteTargets(payload.game.currentRound.voteMode.voteTargets ?? null);
        setVoterGamePlayerId(payload.game.currentRound.voteMode.voterGamePlayerId ?? null);
        setHasVoted(payload.game.currentRound.voteMode.hasVoted ?? false);
        setSelectedVoteTarget(null);
      } else {
        setVoteTargets(null); setVoterGamePlayerId(null); setHasVoted(false); setVoteProgress(null); setSelectedVoteTarget(null);
      }
    };

    // When the game ends, store results so GamePage renders game-over screen.
    // User clicks "Back to Lobby" in GamePage to navigate back.
    const onGameEnded = (results: EndGameResultsDto) => {
      setEndGameResults(results);
      setGameState(null);
      setGameId(null);
      setLobbyRoomCode(results.roomCode);
    };

    // On (re)connect, re-join the appropriate room based on current URL
    // Skip game:join if we already know the game has ended
    const onVoteUpdate = (payload: { submittedVotes: number; totalVoters: number }) => {
      setVoteProgress({ submittedVotes: payload.submittedVotes, totalVoters: payload.totalVoters });
    };

    const onConnect = () => {
      setSocketConnected(true);
      const path = window.location.pathname;
      const state = useStore.getState();

      const gameMatch = path.match(/^\/game\/(.+)$/);
      const lobbyMatch = path.match(/^\/lobby\/(.+)$/);
      const isHome = path === "/";

      if (gameMatch) {
        const gameId = gameMatch[1];
        if (!state.endGameResults) {
          socket.emit("game:join", { gameId });
        } else if (state.lobbyRoomCode) {
          socket.emit("lobby:get", { roomCode: state.lobbyRoomCode });
        }
        return;
      }

      if (lobbyMatch) {
        socket.emit("lobby:join", { roomCode: lobbyMatch[1] });
        return;
      }

      if (isHome && state.lobbyRoomCode) {
        socket.emit("lobby:get", { roomCode: state.lobbyRoomCode });
      }
    };

    const onGameCancelled = (payload: { roomCode: string }) => {
      setGameState(null);
      setGameId(null);
      setEndGameResults(null);
      setLobby(null);
      setLobbyRoomCode(payload.roomCode);
      navigate(`/lobby/${payload.roomCode}`, { replace: true });
      // Fallback: if lobby doesn't load within 5s, go home (lobby may be deleted)
      if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);
      cancelTimeoutRef.current = setTimeout(() => {
        const currentLobby = useStore.getState().lobby;
        if (!currentLobby) navigate("/", { replace: true });
      }, 5000);
    };

    const onDisconnect = () => setSocketConnected(false);
    const onConnectError = (err: Error) => {
      if (err.message?.toLowerCase().includes("unauthorized")) {
        useStore.getState().reset();
      }
    };

    const onPlayerDisconnected = (payload: {
      gamePlayerId: string;
      userId: string;
      username: string;
      graceMs: number;
    }) => {
      setDisconnectedPlayer(payload.username);
      toast(`${payload.username} disconnected`, { duration: 3000 });
      setTimeout(() => {
        const current = useStore.getState();
        if (current.disconnectedPlayer === payload.username) {
          setDisconnectedPlayer(null);
        }
      }, 3000);
    };

    const onPlayerReconnected = (payload: {
      gamePlayerId: string;
      userId: string;
      username: string;
    }) => {
      setDisconnectedPlayer(null);
      toast(`${payload.username} reconnected`, { duration: 2000 });
    };

    const onLeaveConfirmed = (_payload: { roomCode: string }) => {
      // Navigate first — don't clear lobby here or LobbyPage's effect
      // may re-run with stale roomCode and emit lobby:join (rejoin).
      navigate("/", { replace: true });
      setLobbyRoomCode(null);
    };

    socket.on("lobby:created", onCreated);
    socket.on("lobby:updated", onUpdated);
    socket.on("lobby:current", onCurrent);
    socket.on("lobby:deleted", onDeleted);
    socket.on("lobby:leaveConfirmed", onLeaveConfirmed);
    socket.on("lobby:error", onLobbyError);
    socket.on("game:started", onGameStarted);
    socket.on("game:state", onGameStateChanged);
    socket.on("game:ended", onGameEnded);
    socket.on("game:cancelled", onGameCancelled);
    socket.on("game:playerDisconnected", onPlayerDisconnected);
    socket.on("game:playerReconnected", onPlayerReconnected);
    socket.on("game:error", onGameError);
    socket.on("game:voteUpdate", onVoteUpdate);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    // If already connected (e.g., StrictMode double-mount or cached socket), fire onConnect now
    if (socket.connected) {
      onConnect();
    }

    return () => {
      if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);
      socket.off("lobby:created", onCreated);
      socket.off("lobby:updated", onUpdated);
      socket.off("lobby:current", onCurrent);
      socket.off("lobby:deleted", onDeleted);
      socket.off("lobby:leaveConfirmed", onLeaveConfirmed);
      socket.off("lobby:error", onLobbyError);
      socket.off("game:started", onGameStarted);
      socket.off("game:state", onGameStateChanged);
      socket.off("game:ended", onGameEnded);
      socket.off("game:cancelled", onGameCancelled);
      socket.off("game:playerDisconnected", onPlayerDisconnected);
      socket.off("game:playerReconnected", onPlayerReconnected);
      socket.off("game:error", onGameError);
      socket.off("game:voteUpdate", onVoteUpdate);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, [
    token,
    setLobby,
    setGameId,
    navigate,
    setGameState,
    setEndGameResults,
    setLobbyRoomCode,
    setSocketConnected,
    setDisconnectedPlayer,
    setWinnerReveal,
    setVoteTargets,
    setVoterGamePlayerId,
    setHasVoted,
    setVoteProgress,
    setSelectedVoteTarget,
  ]);

  // Sync socket room on SPA navigation (browser back/forward, direct nav)
  useEffect(() => {
    const socket = getSocket();
    if (!socket?.connected) return;

    const path = location.pathname;
    const gameMatch = path.match(/^\/game\/(.+)$/);
    const lobbyMatch = path.match(/^\/lobby\/(.+)$/);

    if (gameMatch) {
      const state = useStore.getState();
      if (!state.endGameResults) {
        socket.emit("game:join", { gameId: gameMatch[1] });
      } else if (state.lobbyRoomCode) {
        socket.emit("lobby:get", { roomCode: state.lobbyRoomCode });
      }
    } else if (lobbyMatch) {
      socket.emit("lobby:get", { roomCode: lobbyMatch[1] });
    } else if (path === "/") {
      const state = useStore.getState();
      if (state.lobbyRoomCode) {
        socket.emit("lobby:get", { roomCode: state.lobbyRoomCode });
      }
    }
  }, [location.pathname]);

  return null;
}
