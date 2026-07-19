import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import { getSocket } from "../lib/socket";
import GameTopBar from "../components/game-components/GameTopBar";
import GameSidebar from "../components/game-components/GameSidebar";
import PlayingPhase from "../components/game-components/phases/PlayingPhase";
import RevealPhase from "../components/game-components/phases/RevealPhase";
import WinnerRevealPhase from "../components/game-components/phases/WinnerRevealPhase";
import GameOverPhase from "../components/game-components/phases/GameOverPhase";
import { VotePhase } from "../components/game-components/modes/czar-is-dead/VotePhase";

function DisconnectedBanner({ username }: { username: string | null }) {
  const [visible, setVisible] = useState(false);
  const lastRef = useRef<string | null>(null);

  useEffect(() => {
    if (username) {
      lastRef.current = username;
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [username]);

  return (
    <div
      className={`transition-all duration-300 ease-in-out overflow-hidden ${
        visible ? "max-h-20 opacity-100 py-3 my-4" : "max-h-0 opacity-0 py-0 my-0"
      } bg-primary text-primary-foreground font-mono text-body-md px-4 text-center brutal-shadow-sm mx-4`}
    >
      {visible && lastRef.current ? `${lastRef.current} disconnected` : ""}
    </div>
  );
}

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const userId = useStore((s) => s.userId);
  const gameState = useStore((s) => s.gameState);
  const endGameResults = useStore((s) => s.endGameResults);
  const socketConnected = useStore((s) => s.socketConnected);
  const disconnectedPlayer = useStore((s) => s.disconnectedPlayer);
  const [loadError, setLoadError] = useState(false);
  const joinedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !gameId) {
      navigate("/", { replace: true });
      return;
    }
    if (joinedRef.current === gameId) return;
    joinedRef.current = gameId;
    const socket = getSocket();
    if (socket) {
      socket.emit("game:join", { gameId });
    }
  }, [userId, gameId, navigate]);

  useEffect(() => {
    if (!gameId) return;
    const t = setTimeout(() => {
      if (!gameState && !endGameResults) {
        setLoadError(true);
      }
    }, 10000);
    return () => clearTimeout(t);
  }, [gameId, gameState, endGameResults]);

  useEffect(() => {
    if (!loadError) return;
    const t = setTimeout(() => {
      navigate("/", { replace: true });
    }, 15000);
    return () => clearTimeout(t);
  }, [loadError, navigate]);

  if (loadError) {
    return (
      <div className='min-h-screen flex flex-col items-center justify-center gap-4'>
        <p className='font-mono text-headline-lg uppercase tracking-tight'>
          Something went wrong
        </p>
        <p className='font-mono text-body-md text-muted-foreground'>
          Redirecting to home...
        </p>
      </div>
    );
  }

  if (!gameState && !endGameResults) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <p className='font-mono text-body-lg'>Loading game...</p>
      </div>
    );
  }

  const showWinnerReveal =
    gameState?.game.winnerReveal && !gameState?.game.currentRound;
  const showReveal = gameState?.game.currentRound?.status === "REVEAL";
  const showPlaying = gameState?.game.currentRound?.status === "PLAYING";
  const showVoting = gameState?.game.currentRound?.status === "VOTING";

  return (
    <div className='min-h-screen bg-background'>
      <GameTopBar />
      <GameSidebar />

      <main className='pt-24 lg:ml-64 min-h-screen flex flex-col'>
        {!socketConnected && (
          <div className='bg-primary text-primary-foreground font-mono text-body-md px-4 py-3 text-center brutal-shadow-sm m-4'>
            Connection lost. Reconnecting...
          </div>
        )}

        <DisconnectedBanner username={disconnectedPlayer} />

        <div className='flex-1 flex flex-col items-center px-margin-mobile md:px-margin-desktop'>
          {endGameResults && <GameOverPhase />}
          {!endGameResults && showWinnerReveal && <WinnerRevealPhase />}
          {!endGameResults && !showWinnerReveal && showReveal && (
            <RevealPhase />
          )}
          {!endGameResults &&
            !showWinnerReveal &&
            !showReveal &&
            showPlaying && <PlayingPhase />}
          {showVoting && <VotePhase />}
          {!endGameResults &&
            !showWinnerReveal &&
            !showReveal &&
            !showPlaying &&
            !showVoting && (
              <div className='flex items-center justify-center flex-1'>
                <p className='font-mono text-body-lg'>
                  Waiting for game state...
                </p>
              </div>
            )}
        </div>
      </main>
    </div>
  );
}
