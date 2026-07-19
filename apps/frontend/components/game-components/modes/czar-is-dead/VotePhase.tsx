import { useEffect, useMemo } from "react";
import { useStore } from "../../../../lib/store";
import GameBlackCard from "../../GameBlackCard";
import { Tooltip, TooltipTrigger, TooltipContent } from "../../../ui/tooltip";

export function VotePhase() {
  const gameState = useStore((s) => s.gameState);
  const voterGamePlayerId = useStore((s) => s.voterGamePlayerId);
  const hasVoted = useStore((s) => s.hasVoted);
  const voteProgress = useStore((s) => s.voteProgress);
  const castVote = useStore((s) => s.castVote);
  const selected = useStore((s) => s.selectedVoteTarget);
  const setSelected = useStore((s) => s.setSelectedVoteTarget);

  useEffect(() => { setSelected(null); }, [setSelected]);

  if (!gameState?.game.currentRound) return null;

  const round = gameState.game.currentRound;

  const mySubmission = round.submissions.find(
    (s) => s.gamePlayerId === voterGamePlayerId,
  );

  const votableSubmissions = useMemo(() => {
    const others = round.submissions.filter(
      (s) => s.gamePlayerId !== voterGamePlayerId,
    );
    const copy = [...others];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }, [round.submissions, voterGamePlayerId]);

  return (
    <section className='max-w-6xl mx-auto py-12'>
      <div className='max-w-4xl mx-auto mb-16 text-center'>
        <div className='inline-block relative'>
          <GameBlackCard card={round.blackCard} badge='VOTE' />
        </div>
      </div>

      {!hasVoted && (
        <div className='flex justify-center mb-8'>
          <Tooltip>
            <TooltipTrigger>
              <button
                disabled={!selected}
                onClick={() => castVote(gameState.game.gameId, selected!)}
                className={`bg-primary text-primary-foreground px-12 py-4 font-display text-2xl uppercase tracking-tighter brutal-shadow-md hover:-translate-y-1 hover:translate-x-[-1px] transition-all active:translate-y-1 active:shadow-sm ${!selected ? "opacity-50 cursor-not-allowed" : ""} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {selected ? "Confirm Vote" : "Select a card"}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {selected ? "No take backs!" : "Click a card to vote for it"}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {voteProgress && (
        <div className='text-center mb-8'>
          <span className='font-label-caps text-label-caps uppercase bg-primary text-primary-foreground px-4 py-2 tracking-wider'>
            Votes: {voteProgress.submittedVotes}/{voteProgress.totalVoters}
          </span>
        </div>
      )}

      {hasVoted ? (
        <div className='text-center mb-8'>
          <span className='font-body-md text-body-md bg-surface-variant border-2 border-primary px-6 py-3 brutal-shadow-sm'>
            Vote submitted — waiting for others...
          </span>
        </div>
      ) : (
        <>
          <div className='text-center mb-8'>
            <h3 className='font-display text-headline-lg uppercase tracking-tight'>
              Vote for your favourite
            </h3>
          </div>

          <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8 justify-items-center'>
            {votableSubmissions.map((sub) => (
              <div
                key={sub.gamePlayerId}
                className={`relative w-64 h-80 p-6 flex flex-col justify-between border-4 transition-all duration-75 cursor-pointer ${
                  selected === sub.gamePlayerId
                    ? "bg-primary text-primary-foreground -translate-x-1 -translate-y-1 brutal-shadow-sm border-primary"
                    : "bg-white text-black brutal-shadow-sm brutal-card-hover border-primary hover:-translate-y-1"
                }`}
                onClick={() => setSelected(sub.gamePlayerId)}
              >
                <div className='font-body-lg text-lg leading-tight line-clamp-6'>
                  {sub.cards.map((c, ci) => (
                    <span key={ci}>
                      {ci > 0 && <span className="mx-1 opacity-30">/</span>}
                      {c.isBlank ? c.customText || c.text : c.text}
                    </span>
                  ))}
                </div>
                <div className='flex items-center justify-between'>
                  <span className='font-label-caps text-[10px] tracking-widest opacity-50 uppercase'>
                    CARDS AGAINST HUMANITY
                  </span>
                </div>
              </div>
            ))}
          </div>

          {mySubmission && (
            <div className='flex justify-center mt-12'>
              <div className='flex flex-col items-center gap-2'>
                <span className='font-label-caps text-label-caps text-secondary uppercase tracking-wider text-xs'>
                  Your submission
                </span>
                <Tooltip>
                  <TooltipTrigger>
                    <div className='w-48 h-56 bg-white text-black p-4 flex flex-col justify-between border-2 border-gray-300 brutal-shadow-sm opacity-70 cursor-default'>
                      <p className='font-body-md text-sm leading-tight line-clamp-5'>
                        {mySubmission.cards.map((c, ci) => (
                          <span key={ci}>
                            {ci > 0 && <span className="mx-1 opacity-30">/</span>}
                            {c.isBlank ? c.customText || c.text : c.text}
                          </span>
                        ))}
                      </p>
                      <div className='flex items-center justify-between'>
                        <span className='font-label-caps text-[8px] tracking-widest opacity-30 uppercase'>
                          CAH
                        </span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Can't vote for yourself</TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}

        </>
      )}
    </section>
  );
}
