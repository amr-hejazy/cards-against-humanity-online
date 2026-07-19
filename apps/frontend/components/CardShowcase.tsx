const cards = [
  { text: "Why am I sticky?", type: "black" as const },
  { text: "A mime having a stroke.", type: "white" as const },
  { text: "The blood of Christ.", type: "white" as const },
];

const rotations = ["-rotate-[2deg]", "rotate-[1deg]", "-rotate-[1deg]"];

export default function CardShowcase() {
  return (
    <section className="hidden lg:grid grid-cols-3 gap-8 w-full px-12">
      {cards.map((card, i) => (
        <div
          key={i}
          className={
            card.type === "black"
              ? `bg-primary p-6 border-4 border-primary brutal-shadow-sm ${rotations[i]} flex flex-col justify-between aspect-[3/4]`
              : `bg-surface p-6 border-4 border-primary brutal-shadow-sm ${rotations[i]} flex flex-col justify-between aspect-[3/4]`
          }
        >
          <p
            className={
              card.type === "black"
                ? "text-body-lg text-primary-foreground"
                : "text-body-lg text-on-surface"
            }
          >
            {card.text}
          </p>
          <div className="flex items-center gap-2">
            <svg
              className={
                card.type === "black" ? "text-primary-foreground size-3" : "text-primary size-3"
              }
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span
              className={
                card.type === "black"
                  ? "text-[10px] font-bold text-primary-foreground tracking-widest uppercase"
                  : "text-[10px] font-bold text-primary tracking-widest uppercase"
              }
            >
              Cards Against Humanity
            </span>
          </div>
        </div>
      ))}
    </section>
  );
}
