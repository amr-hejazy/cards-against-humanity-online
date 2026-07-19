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

const dialogClass =
  "!rounded-none !border-4 !border-primary !bg-white !p-8 max-w-lg !ring-0";

export function TermsModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={dialogClass} showCloseButton={false}>
        <DialogTitle className="font-display text-headline-lg uppercase">
          Terms
        </DialogTitle>
        <DialogDescription className="space-y-3 text-sm font-body-md text-foreground">
          <p>
            This is a free, fan-made clone built for fun. It is not affiliated
            with or endorsed by Cards Against Humanity LLC.
          </p>
          <p>
            You must be 17 or older (or the age of majority where you live) —
            the card content is explicit and intended for mature audiences.
          </p>
          <p>
            Some card text is © Cards Against Humanity, used under the
            Creative Commons BY-NC-SA 2.0 (non-commercial) license.
          </p>
          <p>Content is provided as-is, with no warranty.</p>
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

export function BuyGameModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={dialogClass} showCloseButton={false}>
        <DialogTitle className="font-display text-headline-lg uppercase">
          Love it?
        </DialogTitle>
        <DialogDescription className="space-y-3 text-sm font-body-md text-foreground">
          <p>
            This is a free fan-made clone. The real thing is even better —
            support the original creators and grab a physical deck.
          </p>
          <a
            href="https://cardsagainsthumanity.com"
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-black text-white px-6 py-3 font-bold uppercase btn-press w-full text-center border-4 border-black hover:bg-white hover:text-black transition-colors"
            onClick={onClose}
          >
            Get the real game →
          </a>
        </DialogDescription>
        <button
          className="mt-2 bg-white text-black border-4 border-black px-6 py-3 font-bold uppercase btn-press brutal-shadow-md w-full hover:-translate-y-0.5 transition-all"
          onClick={onClose}
        >
          Close
        </button>
      </DialogContent>
    </Dialog>
  );
}
