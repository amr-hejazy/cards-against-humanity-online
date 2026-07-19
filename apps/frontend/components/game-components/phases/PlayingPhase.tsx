import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../../../lib/store";
import { getSocket } from "../../../lib/socket";
import { Tooltip, TooltipTrigger, TooltipContent } from "../../ui/tooltip";
import GameBlackCard from "../GameBlackCard";
import GameWhiteCard from "../GameWhiteCard";
import GameSkeletonCard from "../GameSkeletonCard";

export default function PlayingPhase() {
  const gameState = useStore((s) => s.gameState);
  const userId = useStore((s) => s.userId);
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);
  const [blankTexts, setBlankTexts] = useState<Record<number, string>>({});
  const submittingRef = useRef(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  if (!gameState?.game.currentRound || !gameState.player) return null;

  const round = gameState.game.currentRound;
  const myGpId = gameState.game.players.find(
    (p) => p.userId === userId,
  )?.gamePlayerId;
  const isJudge = !!round.judgeGamePlayerId && round.judgeGamePlayerId === myGpId;
  const hand = gameState.player.hand;
  const pickCount = round.blackCard.pick ?? 1;
  const nonJudgeCount = gameState.game.players.length - 1;
  const timedRounds = gameState.game.timedRoundsEnabled;
  const gameMode = gameState.game.gameMode;
  const isBlankOnly = gameMode === "blank_only";
  const roundDuration = gameState.game.roundTimeoutSeconds;

  // Countdown timer for timed rounds
  useEffect(() => {
    if (!timedRounds || !round.roundStartedAt) return;
    const startedAt = new Date(round.roundStartedAt).getTime();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, roundDuration - elapsed);
      setRemainingSeconds(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timedRounds, round.roundStartedAt, roundDuration]);

  const hasBlankWithoutText = selectedCardIds.some(
    (id) => id < 0 && (!blankTexts[id] || blankTexts[id].trim().length === 0),
  );

  const toggleCard = useCallback(
    (cardId: number) => {
      if (submittingRef.current) return;
      setSelectedCardIds((prev) => {
        const idx = prev.indexOf(cardId);
        if (idx >= 0) return prev.filter((id) => id !== cardId);
        if (prev.length < pickCount) return [...prev, cardId];
        return [cardId];
      });
    },
    [pickCount],
  );

  const handleBlankTextChange = useCallback(
    (cardId: number, text: string) => {
      setBlankTexts((prev) => ({ ...prev, [cardId]: text }));
    },
    [],
  );

  const handleSubmit = useCallback(() => {
    if (
      submittingRef.current ||
      selectedCardIds.length < pickCount ||
      hasBlankWithoutText
    )
      return;
    submittingRef.current = true;
    const socket = getSocket();
    if (socket) {
      const customTexts: Record<string, string> = {};
      for (const cardId of selectedCardIds) {
        if (cardId < 0 && blankTexts[cardId]?.trim()) {
          customTexts[cardId.toString()] = blankTexts[cardId];
        }
      }
      socket.emit("game:submit", {
        gameId: gameState.game.gameId,
        whiteCardIds: selectedCardIds,
        ...(Object.keys(customTexts).length > 0 && { customTexts }),
      });
    }
    setTimeout(() => {
      submittingRef.current = false;
    }, 3000);
  }, [selectedCardIds, pickCount, hasBlankWithoutText, blankTexts, gameState?.game.gameId]);

  const timedRoundBar = timedRounds && remainingSeconds !== null ? (
    <div className={`text-center mb-4 font-mono text-sm font-bold ${remainingSeconds <= 10 ? 'text-red-600' : 'text-black'}`}>
      <span>Time before round ends: {remainingSeconds}s</span>
    </div>
  ) : null;

  if (isJudge) {
    return (
      <section className='max-w-5xl mx-auto py-6 md:py-12 flex flex-col items-center justify-center'>
        {timedRoundBar}
        <div className='w-full flex justify-center mb-6 md:mb-12'>
          <GameBlackCard card={round.blackCard} badge='CZAR DECIDING...' />
        </div>
        <div className='text-center mb-4'>
          <p className='font-body-md text-body-md text-black font-semibold mb-2'>
            Wait for all players to submit, then pick your favorite
          </p>
          <span className='font-label-caps text-label-caps uppercase bg-primary text-primary-foreground px-4 py-2 tracking-wider'>
            {round.submittedCount}/{nonJudgeCount} Submitted
          </span>
        </div>
        <div className='flex gap-6 justify-center max-w-4xl flex-wrap'>
          {Array.from({ length: round.submittedCount }).map((_, i) => (
            <GameSkeletonCard key={i} />
          ))}
        </div>
      </section>
    );
  }

  const mySubmission = round.submissions.find((s) => s.gamePlayerId === myGpId);
  if (mySubmission) {
    return (
      <section className='max-w-5xl mx-auto py-6 md:py-12 flex flex-col items-center justify-center'>
        {timedRoundBar}
        <div className='w-full flex justify-center mb-4 md:mb-8'>
          <GameBlackCard
            card={round.blackCard}
            badge={pickCount > 1 ? `PICK ${pickCount}` : undefined}
          />
        </div>
        <div className='mb-4 md:mb-8'>
          <div className='w-52 bg-white text-black border-4 border-primary brutal-shadow-sm p-6 flex flex-col justify-between'>
            <p className='font-body-md text-body-md leading-tight'>
              {mySubmission.cards.map((c) => (c.isBlank ? c.customText || c.text : c.text)).join(" / ")}
            </p>
            <div className='flex items-center justify-between mt-4'>
              <span className='font-label-caps text-[8px] tracking-widest opacity-30 uppercase'>
                CAH
              </span>
            </div>
          </div>
        </div>
        <span className='font-body-md text-body-md bg-surface-variant border-2 border-primary px-6 py-3 brutal-shadow-sm'>
          Submitted — waiting for other players...
        </span>
      </section>
    );
  }

  const autoSubmitWarning = timedRounds && remainingSeconds !== null && remainingSeconds <= 10 ? (
    <div className='text-center mb-2 font-mono text-xs text-red-600 animate-pulse'>
      Random card will be submitted if you don't play!
    </div>
  ) : null;

  return (
    <section className='max-w-5xl mx-auto w-full flex-1 md:flex-none flex flex-col items-center justify-between md:justify-center py-4 md:py-12 pb-0 md:pb-12'>
      {timedRoundBar}
      {autoSubmitWarning}
      <div className='w-full flex justify-center mb-4 md:mb-12'>
        <GameBlackCard
          card={round.blackCard}
          badge={pickCount > 1 ? `PICK ${pickCount}` : undefined}
        />
      </div>

      <div className='h-16 md:h-20 mb-4 md:mb-8 w-full flex justify-center items-center overflow-hidden transition-all duration-300 ease-in-out'>
        <div className={`transition-all duration-300 ease-in-out ${
          selectedCardIds.length === pickCount
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-95 pointer-events-none'
        }`}>
          <Tooltip>
            <TooltipTrigger>
              <button
                type='button'
                disabled={submittingRef.current || hasBlankWithoutText}
                className='bg-primary text-primary-foreground px-12 py-4 font-display text-2xl uppercase tracking-tighter brutal-shadow-md hover:-translate-y-1 hover:translate-x-[-1px] transition-all active:translate-y-1 active:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed'
                onClick={handleSubmit}
              >
                {submittingRef.current ? 'Submitting...' : 'Confirm Selection'}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {hasBlankWithoutText ? 'Write text on blank card first' : 'No take backs!'}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <section className='max-w-6xl mx-auto w-full pb-16 md:pb-12'>
        <div className='mb-4 md:mb-6 flex justify-between items-end border-b-2 border-primary pb-2'>
          <h3 className='font-display text-headline-lg uppercase tracking-tight'>
            Your Hand
          </h3>
          <span className='font-label-caps text-label-caps text-foreground font-bold'>
            {pickCount > 1 ? `Pick ${pickCount} Cards` : 'Pick 1 Card'}
          </span>
        </div>
        <div className={isBlankOnly ? "" : "relative group"}>
          {!isBlankOnly && (
            <button
              type='button'
              onClick={() => {
                const el = document.getElementById("player-hand");
                if (el)
                  el.scrollBy({
                    left: -el.clientWidth * 0.6,
                    behavior: "smooth",
                  });
              }}
              className='absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-primary text-primary-foreground font-mono text-lg font-black flex items-center justify-center brutal-shadow-sm opacity-0 group-hover:opacity-100 transition-opacity'
              aria-label='Scroll left'
            >
              ←
            </button>
          )}
          <div
            id='player-hand'
            className={isBlankOnly ? "flex gap-3 md:gap-6 flex-wrap justify-center py-3" : "flex gap-3 md:gap-6 overflow-x-auto py-3 snap-x touch-pan-x scrollbar-hide"}
          >
            {hand.map((card) => (
              <div key={card.id} className='snap-start shrink-0'>
                <GameWhiteCard
                  card={card}
                  selectable
                  selected={selectedCardIds.includes(card.id)}
                  selectionIndex={selectedCardIds.indexOf(card.id)}
                  onClick={() => toggleCard(card.id)}
                  onTextChange={card.isBlank ? handleBlankTextChange : undefined}
                />
              </div>
            ))}
          </div>
          {!isBlankOnly && (
            <button
              type='button'
              onClick={() => {
                const el = document.getElementById("player-hand");
                if (el)
                  el.scrollBy({ left: el.clientWidth * 0.6, behavior: "smooth" });
              }}
              className='absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-primary text-primary-foreground font-mono text-lg font-black flex items-center justify-center brutal-shadow-sm opacity-0 group-hover:opacity-100 transition-opacity'
              aria-label='Scroll right'
            >
              →
            </button>
          )}
        </div>
      </section>
    </section>
  );
}
