import { useState, useEffect, useRef } from "react";
import { Sun } from "lucide-react";
import type { Card } from "@cah/shared";

type Props = {
  card: Card;
  selected?: boolean;
  selectionIndex?: number;
  selectable?: boolean;
  onClick?: () => void;
  className?: string;
  onTextChange?: (cardId: number, text: string) => void;
};

export default function GameWhiteCard({
  card,
  selected,
  selectionIndex,
  selectable,
  onClick,
  className = "",
  onTextChange,
}: Props) {
  const isInteractive = selectable && onClick;
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (card.isBlank && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  }, [text, card.isBlank]);

  if (card.isBlank) {
    return (
      <div
        className={`
          relative flex-shrink-0 w-36 md:w-52 h-52 md:h-72 p-3 md:p-6 flex flex-col justify-between
          font-body-md text-body-md text-left leading-tight
          border-4 border-primary transition-all duration-75
          ${selected
            ? "bg-primary text-primary-foreground -translate-x-1 -translate-y-1 brutal-shadow-sm"
            : "bg-white text-black brutal-shadow-sm brutal-card-hover"
          }
          cursor-pointer
          ${className}
        `}
        onClick={isInteractive ? onClick : undefined}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onKeyDown={isInteractive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); onTextChange?.(card.id, e.target.value); }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="TYPE YOUR ANSWER..."
          className="w-full flex-1 bg-transparent border-none resize-none outline-none font-body-md text-body-md leading-tight placeholder:text-gray-300"
          maxLength={280}
        />

        <div className="flex items-center justify-between mt-2">
          <span className="font-label-caps text-[8px] tracking-widest opacity-30 uppercase">
            BLANK
          </span>
          <Sun className="w-3 h-3 opacity-30" />
        </div>

        {selected && selectionIndex !== undefined && (
          <span className="absolute -top-3 -right-3 bg-white text-black border-2 border-primary w-7 h-7 flex items-center justify-center font-mono text-label-caps font-black z-10">
            {selectionIndex + 1}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!isInteractive}
      onClick={isInteractive ? onClick : undefined}
      className={`
        relative flex-shrink-0 w-36 md:w-52 h-52 md:h-72 p-3 md:p-6 flex flex-col justify-between
        font-body-md text-body-md text-left leading-tight
        border-4 border-primary transition-all duration-75
        ${selected
          ? "bg-primary text-primary-foreground -translate-x-1 -translate-y-1 brutal-shadow-sm"
          : "bg-white text-black brutal-shadow-sm brutal-card-hover"
        }
        ${isInteractive ? "cursor-pointer" : "cursor-default"}
        ${className}
      `}
    >
      <p className="line-clamp-6 whitespace-pre-line">{card.text}</p>
      <div className="flex items-center justify-between">
        <span className="font-label-caps text-[8px] tracking-widest opacity-30 uppercase">
          CAH
        </span>
        <Sun className="w-3 h-3 opacity-30" />
      </div>
      {selected && selectionIndex !== undefined && (
        <span className="absolute -top-3 -right-3 bg-white text-black border-2 border-primary w-7 h-7 flex items-center justify-center font-mono text-label-caps font-black z-10">
          {selectionIndex + 1}
        </span>
      )}
    </button>
  );
}
