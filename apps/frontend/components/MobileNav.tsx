import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Palette, Users } from "lucide-react";
import { useStore } from "../lib/store";

export default function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const gameState = useStore((s) => s.gameState);
  const [showPlayers, setShowPlayers] = useState(false);

  if (location.pathname === "/" || location.pathname.startsWith("/lobby/")) return null;

  if (location.pathname.startsWith("/game/")) {
    const players = gameState?.game.players ?? [];
    const judgeGpId = gameState?.game.currentRound?.judgeGamePlayerId;
    const sorted = [...players].sort((a: any, b: any) => b.score - a.score);

    return (
      <>
        <nav className="lg:hidden fixed bottom-0 left-0 w-full h-14 bg-background border-t-4 border-primary z-50 flex">
          <button
            onClick={() => {
              const el = document.getElementById("player-hand");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
            className="flex flex-col items-center justify-center bg-primary text-primary-foreground p-1 flex-1 h-full active:scale-95 transition-all"
          >
            <Palette className="size-4" />
            <span className="text-[9px] font-black uppercase tracking-widest mt-0.5">MY HAND</span>
          </button>
          <button
            onClick={() => setShowPlayers(true)}
            className="flex flex-col items-center justify-center text-primary p-1 flex-1 h-full hover:bg-surface-variant active:scale-95 transition-all"
          >
            <Users className="size-4" />
            <span className="text-[9px] font-black uppercase tracking-widest mt-0.5">PLAYERS</span>
          </button>
        </nav>

        {showPlayers && (
          <div
            className="fixed inset-0 z-50 bg-black/50 lg:hidden"
            onClick={() => setShowPlayers(false)}
          >
            <div
              className="absolute bottom-20 left-4 right-4 bg-white border-4 border-primary brutal-shadow-md p-4 max-h-[60vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-display text-headline-lg-mobile uppercase mb-4">Players</h3>
              {sorted.map((p: any) => {
                const isCzar = p.gamePlayerId === judgeGpId;
                return (
                  <div
                    key={p.gamePlayerId ?? p.userId}
                    className="flex items-center justify-between p-3 border-b-2 border-primary/20"
                  >
                    <div className="flex flex-col">
                      <span className="font-body-md text-body-md">{p.username}</span>
                      {isCzar && (
                        <span className="text-[10px] uppercase font-black tracking-widest bg-primary text-primary-foreground px-1 self-start mt-0.5">
                          CZAR
                        </span>
                      )}
                    </div>
                    {"score" in p && (
                      <span className="font-display text-2xl">{String(p.score).padStart(2, "0")}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 w-full flex justify-around items-center h-14 border-t-4 border-primary bg-background z-50">
      <button
        onClick={() => navigate("/")}
        className="flex flex-col items-center justify-center bg-primary text-primary-foreground p-1 w-full h-full active:scale-95 transition-all"
      >
        <Palette className="size-4" />
        <span className="text-[9px] font-black uppercase tracking-widest mt-0.5">HOME</span>
      </button>
      <button className="flex flex-col items-center justify-center text-primary p-1 w-full h-full hover:bg-surface-variant active:scale-95 transition-all cursor-default">
        <Users className="size-4" />
        <span className="text-[9px] font-black uppercase tracking-widest mt-0.5">PLAYERS</span>
      </button>
    </nav>
  );
}
