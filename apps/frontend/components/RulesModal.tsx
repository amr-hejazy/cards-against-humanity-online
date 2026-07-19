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

export default function RulesModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className='!rounded-none !border-4 !border-primary !bg-white !p-8 max-w-lg !ring-0' showCloseButton={false}>
        <DialogTitle className="font-display text-headline-lg uppercase">How To Play</DialogTitle>
        <DialogDescription className="space-y-3 text-sm font-body-md text-foreground">
          <p>Each round, a black card with a prompt is shown.</p>
          <p>Player's goal is to choose their funniest white card to play for that prompt.</p>
          <p>The Card Czar picks the best submission. Winner gets 1 point.</p>
          <p>Win by getting more points than your opponents!</p>
        </DialogDescription>
        <button
          className="mt-2 bg-black text-white px-6 py-3 font-bold uppercase btn-press brutal-shadow-md w-full hover:-translate-y-0.5 transition-all"
          onClick={onClose}
        >
          Got it
        </button>
      </DialogContent>
    </Dialog>
  );
}
