import { useNavigate } from "react-router-dom";
import { useStore } from "../../../lib/store";

export default function GameOverPhase() {
  const endGameResults = useStore((s) => s.endGameResults);
  const navigate = useNavigate();

  if (!endGameResults) return null;

  const sortedPlayers = [...endGameResults.players].sort(
    (a, b) => b.score - a.score,
  );
  const winner = sortedPlayers[0];

  return (
    <div className='flex flex-col items-center gap-8 py-8'>
      <div className='bg-primary text-primary-foreground px-10 py-6 brutal-shadow'>
        <p className='font-mono text-display uppercase tracking-tight text-center'>
          {endGameResults.isTie ? "IT'S A TIE!" : "GAME OVER"}
        </p>
        {!endGameResults.isTie && winner && (
          <p className='font-mono text-headline-lg uppercase tracking-tight text-center mt-2'>
            {winner.username} Wins!
          </p>
        )}
      </div>

      <div className='w-full max-w-md'>
        <table className='w-full border-collapse'>
          <thead>
            <tr className='border-b-4 border-primary'>
              <th className='font-mono text-label-caps uppercase text-left py-2 px-3'>
                #
              </th>
              <th className='font-mono text-label-caps uppercase text-left py-2 px-3'>
                Player
              </th>
              <th className='font-mono text-label-caps uppercase text-right py-2 px-3'>
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((p, i) => {
              const isWinnerRow = !endGameResults.isTie && i === 0;
              return (
                <tr
                  key={p.gamePlayerId}
                  className={
                    isWinnerRow
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-surface-variant"
                  }
                >
                  <td className='font-mono text-body-md py-2 px-3'>{i + 1}</td>
                  <td className='font-mono text-body-md py-2 px-3'>
                    {p.username}
                  </td>
                  <td className='font-mono text-body-md text-right py-2 px-3'>
                    {p.score}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type='button'
        className='bg-primary text-primary-foreground font-mono text-body-md px-8 py-4 brutal-shadow btn-press hover:-translate-y-0.5 transition-all'
        onClick={() => navigate(`/lobby/${endGameResults.roomCode}`)}
      >
        Back to Lobby
      </button>
    </div>
  );
}
