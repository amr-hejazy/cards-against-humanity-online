type ScoreboardProps = {
  players: { gamePlayerId: string; username: string; score: number }[];
  judgeGamePlayerId: string | null;
};

export default function Scoreboard({ players, judgeGamePlayerId }: ScoreboardProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="w-full border-2 border-primary brutal-shadow-sm bg-background">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-primary">
            <th className="font-mono text-label-caps uppercase text-left py-2 px-3">#</th>
            <th className="font-mono text-label-caps uppercase text-left py-2 px-3">Player</th>
            <th className="font-mono text-label-caps uppercase text-right py-2 px-3">Score</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={p.gamePlayerId} className="hover:bg-surface-variant border-b border-primary/20">
              <td className="font-mono text-body-md py-2 px-3">{i + 1}</td>
              <td className="font-mono text-body-md py-2 px-3">
                {p.username}
                {p.gamePlayerId === judgeGamePlayerId && (
                  <span className="ml-2 bg-primary text-primary-foreground px-1 text-[10px] uppercase font-black">CZAR</span>
                )}
              </td>
              <td className="font-mono text-body-md text-right py-2 px-3 font-black">{p.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
