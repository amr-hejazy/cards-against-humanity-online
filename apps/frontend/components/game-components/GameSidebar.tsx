import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, LogOut } from "lucide-react";
import { useStore } from "../../lib/store";
import { getSocket } from "../../lib/socket";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import RulesModal from "../RulesModal";

export default function GameSidebar() {
  const lobby = useStore((s) => s.lobby);
  const gameState = useStore((s) => s.gameState);
  const userId = useStore((s) => s.userId);
  const lobbyRoomCode = useStore((s) => s.lobbyRoomCode);
  const navigate = useNavigate();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  const players = gameState?.game.players ?? lobby?.players ?? [];
  const judgeGamePlayerId = gameState?.game.currentRound?.judgeGamePlayerId;

  const sortedPlayers = [...players].sort((a: any, b: any) => {
    const scoreA = "score" in a ? (a as any).score : 0;
    const scoreB = "score" in b ? (b as any).score : 0;
    return scoreB - scoreA;
  });

  const handleLeave = () => {
    const socket = getSocket();
    if (socket) socket.emit("lobby:leave", { roomCode: lobbyRoomCode });
    useStore.getState().setLobbyRoomCode(null);
    navigate("/");
  };

  return (
    <>
      <aside className='hidden lg:flex flex-col w-64 h-screen fixed left-0 top-0 pt-24 bg-surface border-r-4 border-primary z-40'>
        <div className='px-6 py-6 border-b-2 border-primary'>
          <h2 className='font-display text-headline-lg-mobile uppercase leading-tight'>
            GAME ROOM #{lobbyRoomCode ?? "---"}
          </h2>
          {judgeGamePlayerId && (
            <p className='text-foreground text-sm mt-1 font-bold'>
              CARD CZAR:{' '}
              <span className='text-foreground font-black underline decoration-2'>
                {sortedPlayers.find(
                  (p: any) => p.gamePlayerId === judgeGamePlayerId,
                )?.username ?? '---'}
              </span>
            </p>
          )}
        </div>

        <div className='flex-1 overflow-y-auto px-4 py-4 space-y-2'>
          {sortedPlayers.map((player: any) => {
            const isSelf = player.userId === userId;
            const isCzar =
              !!player.gamePlayerId &&
              player.gamePlayerId === judgeGamePlayerId;

            return (
              <div
                key={player.userId ?? player.gamePlayerId}
                className={
                  isSelf
                    ? "flex items-center justify-between p-3 bg-primary text-primary-foreground brutal-shadow-sm border-2 border-primary"
                    : "flex items-center justify-between p-3 bg-white text-black border-2 border-primary hover:bg-secondary-container transition-colors"
                }
              >
                <div className='flex flex-col'>
                  <span className='font-body-md text-body-md truncate'>
                    {player.username}
                  </span>
                  {isCzar && (
                    <span className='text-[10px] uppercase font-black tracking-widest bg-primary text-primary-foreground px-1 self-start mt-0.5'>
                      CZAR
                    </span>
                  )}
                </div>
                {"score" in player && (
                  <span className='font-display text-2xl'>
                    {String(player.score).padStart(2, "0")}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className='border-t-2 border-primary'>
          <nav className='space-y-1 px-3 py-4'>
            <a
              className='flex items-center gap-4 px-4 py-4 text-on-surface hover:bg-secondary-container hover:-translate-y-0.5 transition-all duration-100 rounded-none cursor-pointer'
              onClick={() => setRulesOpen(true)}
            >
              <BookOpen className='w-5 h-5' />
              <span className='font-label-caps text-label-caps uppercase tracking-wider'>
                Rules
              </span>
            </a>
            <a
              className='flex items-center gap-4 px-4 py-4 text-on-surface hover:bg-secondary-container hover:-translate-y-0.5 transition-all duration-100 rounded-none cursor-pointer'
              onClick={() => setLeaveOpen(true)}
            >
              <LogOut className='w-5 h-5' />
              <span className='font-label-caps text-label-caps uppercase tracking-wider'>
                Leave Game
              </span>
            </a>
          </nav>
        </div>
      </aside>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className='!rounded-none !border-4 !border-primary !bg-white !p-6 max-w-sm !ring-0'>
          <DialogTitle className='font-display text-headline-lg uppercase tracking-tight'>
            LEAVE GAME?
          </DialogTitle>
          <DialogDescription className='font-body-md text-body-md text-foreground mt-2'>
            Are you sure you want to leave? Your cards will be forfeited.
          </DialogDescription>
          <DialogFooter className='!border-0 !bg-transparent !p-0 !mt-6 !flex-row gap-3'>
            <button
              type='button'
              className='flex-1 bg-primary text-primary-foreground px-4 py-3 font-bold uppercase btn-press hover:-translate-y-0.5 transition-all'
              onClick={() => {
                handleLeave();
                setLeaveOpen(false);
              }}
            >
              YES, LEAVE
            </button>
            <button
              type='button'
              className='flex-1 bg-white text-primary border-4 border-primary px-4 py-3 font-bold uppercase btn-press hover:-translate-y-0.5 transition-all'
              onClick={() => setLeaveOpen(false)}
            >
              CANCEL
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </>
  );
}
