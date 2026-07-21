import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function HowToPlayModal({ open, onClose }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className='!rounded-none !border-4 !border-primary !bg-white !p-8 max-w-lg !ring-0'
        showCloseButton={false}
      >
        <DialogTitle className='font-display text-headline-lg uppercase'>
          What is Cards Against Humanity?
        </DialogTitle>
        <DialogDescription className='space-y-4 text-sm font-body-md text-foreground'>
          <section>
            <p>
              Cards Against Humanity is a party game for horrible people. One
              player asks a question from a black card, and everyone else
              answers with their funniest white card. It's a fill-in-the-blank
              style game where the most offensive, creative, or absurd answer
              wins.
            </p>
          </section>
          <section>
            <h3 className='font-display text-base uppercase tracking-tight mb-1'>
              How to Play
            </h3>
            <ul className='list-disc pl-5 space-y-1'>
              <li>
                Each round, a player takes on the role of the Card Czar and
                draws a black card with a question or fill-in-the-blank phrase.
              </li>
              <li>
                Every player (except the Card Czar) chooses a white card from
                their hand that they think best fills in the blank or answers
                the prompt.
              </li>
              <li>
                The Card Czar reads all submissions and picks the funniest one,
                awarding the player who submitted it 1 point.
              </li>
              <li>
                The Card Czar role passes to the next player, and a new round
                begins.
              </li>
              <li>
                The first player to reach the winning score wins the game!
              </li>
            </ul>
          </section>
        </DialogDescription>
        <button
          className='mt-2 bg-black text-white px-6 py-3 font-bold uppercase btn-press brutal-shadow-md w-full hover:-translate-y-0.5 transition-all'
          onClick={onClose}
        >
          Got it
        </button>
      </DialogContent>
    </Dialog>
  );
}
