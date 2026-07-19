import { useStore } from "../../../lib/store";
import { getSocket } from "../../../lib/socket";
import GameBlackCard from "../GameBlackCard";

export default function RevealPhase() {
  const gameState = useStore((s) => s.gameState);
  const userId = useStore((s) => s.userId);

  if (!gameState?.game.currentRound) return null;

  const round = gameState.game.currentRound;
  const myGpId = gameState.game.players.find(
    (p) => p.userId === userId,
  )?.gamePlayerId;
  const isJudge = round.judgeGamePlayerId === myGpId;

  const shuffled = [...round.submissions];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const handlePickWinner = (gamePlayerId: string) => {
    if (!isJudge) return;
    const socket = getSocket();
    if (socket) {
      socket.emit("game:judgeSubmission", {
        gameId: gameState.game.gameId,
        winningGamePlayerId: gamePlayerId,
      });
    }
  };

  return (
    <section className='max-w-6xl mx-auto py-12'>
      <div className='max-w-4xl mx-auto mb-16 text-center'>
        <div className='inline-block relative'>
          <GameBlackCard card={round.blackCard} badge='CZAR DECIDING...' />
        </div>
      </div>

      {isJudge ? (
        <>
          <div className='text-center mb-8'>
            <h3 className='font-display text-headline-lg mb-8 uppercase tracking-tight'>
              Submitted Cards
            </h3>
          </div>
          <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8 justify-items-center'>
            {shuffled.map((sub) => (
              <div
                key={sub.gamePlayerId}
                className='w-64 h-80 bg-white text-black p-6 flex flex-col justify-between border-4 border-primary brutal-shadow-lg card-hover cursor-pointer transition-all hover:-translate-y-1 hover:brutal-shadow'
                onClick={() => handlePickWinner(sub.gamePlayerId)}
              >
                <div className='font-body-lg text-lg leading-tight line-clamp-6'>
                  {sub.cards.map((c, ci) => (
                    <span key={ci}>
                      {ci > 0 && <span className="mx-1 opacity-30">/</span>}
                      {c.isBlank ? c.customText || c.text : c.text}
                    </span>
                  ))}
                </div>
                <div className='flex items-center gap-2'>
                  <span className='font-label-caps text-[10px] tracking-widest opacity-50 uppercase'>
                    CARDS AGAINST HUMANITY
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {(() => {
            const mySubmission = round.submissions.find(
              (s) => s.gamePlayerId === myGpId,
            );
            if (!mySubmission) return null;
            return (
              <div className='flex flex-col items-center mb-8'>
                <div className='w-64 bg-white text-black border-4 border-primary brutal-shadow-sm p-6 flex flex-col justify-between'>
                  <p className='font-body-md text-body-md leading-tight'>
                    {mySubmission.cards.map((c, ci) => (
                      <span key={ci}>
                        {ci > 0 && <span className="mx-1 opacity-30">/</span>}
                        {c.isBlank ? c.customText || c.text : c.text}
                      </span>
                    ))}
                  </p>
                  <div className='flex items-center justify-between mt-4'>
                    <span className='font-label-caps text-[8px] tracking-widest opacity-30 uppercase'>
                      CAH
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
          <div className='text-center mb-8'>
            <span className='font-body-md text-body-md bg-primary text-primary-foreground px-6 py-3 brutal-shadow-sm inline-block'>
              Card Czar is deciding...
            </span>
          </div>
        </>
      )}
    </section>
  );
}
