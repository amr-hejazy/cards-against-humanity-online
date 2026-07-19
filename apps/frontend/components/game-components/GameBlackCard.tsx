import { Moon } from "lucide-react";
import type { Card } from "@cah/shared";

type Props = {
  card: Card;
  badge?: string;
  className?: string;
};

export default function GameBlackCard({ card, badge, className = "" }: Props) {
  return (
    <div
      className={`relative w-72 h-96 bg-primary text-primary-foreground p-8 flex flex-col justify-between brutal-shadow-md border-4 border-white ${className}`}
    >
      {badge && (
        <span className="absolute -top-4 -right-4 bg-white text-black border-2 border-black px-3 py-1 font-bold text-sm rotate-12 brutal-shadow-sm z-10">
          {badge}
        </span>
      )}
      <div className="flex-1 flex items-center">
        <p className="font-body-lg text-body-lg leading-tight whitespace-pre-line">{card.text}</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-label-caps text-[10px] tracking-widest opacity-50 uppercase">
          Cards Against Humanity
        </span>
        <div className="flex items-center gap-1">
          {card.pick && card.pick > 1
            ? Array.from({ length: card.pick }).map((_, i) => (
                <div key={i} className="w-3 h-3 bg-white" />
              ))
            : <Moon className="w-4 h-4" />}
        </div>
      </div>
    </div>
  );
}
