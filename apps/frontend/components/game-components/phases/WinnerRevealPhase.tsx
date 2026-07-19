import { useEffect, useState, useRef } from "react";
import { useStore } from "../../../lib/store";
import { getSocket } from "../../../lib/socket";
import { createConfetti } from "../../confetti";
import { Tooltip, TooltipTrigger, TooltipContent } from "../../../components/ui/tooltip";
import { Square, ArrowRight } from "lucide-react";

const tooltipTextClass = 'block text-xs uppercase tracking-wider text-primary mb-1 truncate max-w-full';

function TruncatedTooltip({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el) setTruncated(el.scrollWidth > el.clientWidth);
  }, [text]);

  if (!truncated) {
    return <span ref={ref} className={tooltipTextClass}>{text}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger className={tooltipTextClass} render={<span />}>{text}</TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

export default function WinnerRevealPhase() {
  const gameState = useStore((s) => s.gameState);
  const userId = useStore((s) => s.userId);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const winnerReveal = gameState?.game.winnerReveal;

  useEffect(() => {
    createConfetti();
    const interval = setInterval(() => {
      createConfetti();
    }, 5000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!winnerReveal?.autoAdvanceAt) return;
    const target = new Date(winnerReveal.autoAdvanceAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [winnerReveal?.autoAdvanceAt]);

  if (!gameState?.game || !winnerReveal) return null;

  const myGpId = gameState.game.players.find(
    (p) => p.userId === userId,
  )?.gamePlayerId;
  const isJudge = myGpId === winnerReveal.previousJudgeGamePlayerId;

  const sortedPlayers = [...gameState.game.players].sort(
    (a, b) => b.score - a.score,
  );

  const handleNextRound = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit("game:startNextRound", {
        gameId: gameState.game.gameId,
      });
    }
  };

  const isRandoWin = winnerReveal.winnerGamePlayerId === "rando";

  return (
    <section className='max-w-4xl mx-auto py-12'>
      {/* Round Winner Banner */}
      <div className='text-center mb-12'>
        <div className={`inline-block py-4 px-12 brutal-shadow-md -rotate-1 ${isRandoWin ? 'bg-black text-white' : 'bg-primary text-primary-foreground'}`}>
          <h1 className='font-display text-headline-lg uppercase tracking-tighter'>
            {isRandoWin ? "Round Winner: Nobody" : `Round Winner: ${winnerReveal.winnerUsername}`}
          </h1>
          {isRandoWin && (
            <p className='font-mono text-sm mt-2 opacity-70'>Rando Cardrissian strikes again!</p>
          )}
        </div>
      </div>

      {/* Winning Card Pair */}
      <div className='flex flex-col md:flex-row justify-center items-center gap-8 md:gap-4 mt-8 mb-16'>
        {/* Black Card */}
        <div className='bg-primary text-primary-foreground p-8 w-full max-w-[280px] aspect-[3/4] flex flex-col justify-between border-4 border-primary brutal-shadow-sm -rotate-[2deg]'>
          <p className='font-body-lg text-body-lg leading-tight'>
            {winnerReveal.blackCard.text}
          </p>
          <div className='flex items-center justify-between'>
            <span className='font-label-caps text-[10px] tracking-widest opacity-50 uppercase'>
              Cards Against Humanity
            </span>
            <div className='flex gap-1'>
              <Square className='w-3 h-3 fill-current' />
              <Square className='w-3 h-3 fill-current' />
            </div>
          </div>
        </div>

        {/* Winning White Card */}
        <div className='bg-white text-black p-8 w-full max-w-[280px] aspect-[3/4] flex flex-col justify-between border-4 border-primary brutal-shadow-sm rotate-[2deg]'>
          <p className='font-body-lg text-body-lg leading-tight'>
            {winnerReveal.winningCards.map((c, ci) => (
              <span key={ci}>
                {ci > 0 && <span className="mx-1 opacity-30"> / </span>}
                {c.isBlank ? c.customText || c.text : c.text}
              </span>
            ))}
          </p>
          <div className='flex items-center justify-between'>
            <span className='font-label-caps text-[10px] tracking-widest opacity-30 uppercase'>
              Cards Against Humanity
            </span>
          </div>
        </div>
      </div>

      {/* Winner Votes */}
      {(() => {
        const winnerDetail = winnerReveal.submissionDetails?.find(
          (s) => s.gamePlayerId === winnerReveal.winnerGamePlayerId,
        );
        return winnerDetail?.votedBy?.length ? (
          <div className='text-center -mt-8 mb-16'>
            <p className='font-label-caps text-base tracking-wider text-primary font-bold uppercase'>
              Voted by: {winnerDetail.votedBy.join(", ")}
            </p>
          </div>
        ) : null;
      })()}

      {/* Scoreboard */}
      <div className='max-w-3xl mx-auto mt-16'>
        <div className='flex items-center gap-4 mb-8'>
          <h2 className='font-display text-headline-lg uppercase'>
            Scoreboard
          </h2>
          <div className='flex-1 border-b-4 border-primary ml-4' />
        </div>
        <div className='border-4 border-primary bg-white brutal-shadow overflow-hidden'>
          <ul className='divide-y-2 divide-primary'>
            {sortedPlayers.map((p, i) => {
              const isWinnerRow =
                p.gamePlayerId === winnerReveal.winnerGamePlayerId;
              return (
                <li
                  key={p.gamePlayerId}
                  className={
                    isWinnerRow
                      ? "flex items-center justify-between p-6 bg-primary text-primary-foreground"
                      : "flex items-center justify-between p-6 hover:bg-surface-variant transition-colors"
                  }
                >
                  <div className='flex items-center gap-6'>
                    <span className='font-display text-display leading-none opacity-40'>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <span className='font-display text-headline-lg-mobile block'>
                        {p.username}
                      </span>
                      {isWinnerRow && (
                        <span className='font-label-caps text-label-caps text-on-primary-container uppercase tracking-wider'>
                          ROUND WINNER
                        </span>
                      )}
                    </div>
                  </div>
                  <span className='font-display text-headline-lg'>
                    {p.score} PTS
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Other Submissions */}
      {winnerReveal.submissionDetails && winnerReveal.submissionDetails.length > 0 && (
        <div className='max-w-3xl mx-auto mt-16'>
          <div className='flex items-center gap-4 mb-8'>
            <h2 className='font-display text-headline-lg uppercase'>Other Submissions</h2>
            <div className='flex-1 border-b-4 border-primary ml-4' />
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {winnerReveal.submissionDetails
              .filter((s) => s.gamePlayerId !== winnerReveal.winnerGamePlayerId)
              .map((sub) => (
              <div
                key={sub.gamePlayerId}
                className='bg-white border-4 border-black p-4 brutal-shadow-sm'
              >
                <p className='text-xs uppercase text-primary font-bold mb-1'>{sub.username}</p>
                {sub.votedBy?.length ? (
                  <TruncatedTooltip text={`Voted by: ${sub.votedBy.join(", ")}`} />
                ) : null}
                <p className='font-body-md text-body-md'>{sub.cards.map((c, ci) => (
                  <span key={ci}>
                    {ci > 0 && <span className="mx-1 opacity-30"> / </span>}
                    {c.isBlank ? c.customText || c.text : c.text}
                  </span>
                ))}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next Round Button */}
      <div className='fixed bottom-24 lg:bottom-12 left-0 right-0 lg:left-64 px-margin-mobile flex justify-center z-40'>
        {!winnerReveal.isFinalRound && isJudge && (
          <button
            type='button'
            className='bg-primary text-primary-foreground py-6 px-16 font-display text-headline-lg uppercase brutal-shadow-md active:translate-y-0.5 hover:-translate-y-0.5 transition-all flex items-center gap-4'
            onClick={handleNextRound}
          >
            <span>Start Next Round</span>
            {timeLeft !== null && (
              <span className='text-sm opacity-70'>({timeLeft}s)</span>
            )}
            <ArrowRight className='w-8 h-8' />
          </button>
        )}
        {!winnerReveal.isFinalRound && !isJudge && (
          <span className='font-body-md text-body-md bg-surface-variant border-2 border-primary px-6 py-4 brutal-shadow-sm inline-block'>
            {gameState.game.gameMode === "czar_is_dead" || (gameState.game.gameMode === "blank_only" && gameState.game.modeConfig?.votingStyle === "all_votes")
              ? `Next round in ${timeLeft ?? 15}s`
              : `Waiting for Card Czar...${timeLeft !== null ? ` (${timeLeft}s)` : ""}`}
          </span>
        )}
        {winnerReveal.isFinalRound && (
          <span className='font-body-md text-body-md bg-black text-white border-2 border-primary px-6 py-4 brutal-shadow-sm inline-block'>
            {winnerReveal.endReason === "winning_score_reached"
              ? "Winning score reached — game ending..."
              : "Final round — game ending..."}
            {timeLeft !== null ? ` (${timeLeft}s)` : ""}
          </span>
        )}
      </div>

      <div className='h-32' />
    </section>
  );
}
