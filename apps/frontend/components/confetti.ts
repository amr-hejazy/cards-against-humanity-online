const COLORS = ["#000000", "#333333", "#111111"];

export function createConfetti() {
  const pieces: HTMLDivElement[] = [];
  for (let i = 0; i < 50; i++) {
    const piece = document.createElement("div");
    piece.className = "fixed pointer-events-none z-50";
    const size = Math.random() * 8 + 8;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    piece.style.backgroundColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.top = "-10vh";
    piece.style.animation = `confetti-fall ${2 + Math.random() * 3}s ${Math.random() * 2}s ease-out forwards`;
    piece.style.borderRadius = "0px";
    document.body.appendChild(piece);
    pieces.push(piece);
    const duration = (2 + Math.random() * 3 + Math.random() * 2) * 1000;
    setTimeout(() => {
      piece.remove();
    }, duration + 100);
  }
  return pieces;
}
