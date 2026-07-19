type Props = {
  className?: string;
};

export default function GameSkeletonCard({ className = "" }: Props) {
  return (
    <div
      className={`w-52 h-72 bg-surface-variant border-4 border-primary brutal-shadow-sm animate-pulse flex items-center justify-center p-6 ${className}`}
    >
      <span className="font-label-caps text-label-caps text-muted-foreground uppercase tracking-wider">
        ???
      </span>
    </div>
  );
}
