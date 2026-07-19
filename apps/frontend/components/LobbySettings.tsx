import { useState, useEffect, useMemo } from "react";
import type { GameMode, LobbyDto, PackInfo, VotingStyle } from "@cah/shared";
import { DEFAULT_ROUND_TIMEOUT_SECONDS } from "@cah/shared";
import { getSocket } from "../lib/socket";
import { X, Search } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { toast } from "sonner";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";

type Props = {
  lobby: LobbyDto;
  availablePacks: PackInfo[];
  isHost: boolean;
  roomCode: string;
  open: boolean;
  onClose: () => void;
  isMobile: boolean;
  gameMode: GameMode;
  onGameModeChange: (mode: GameMode) => void;
};

export default function LobbySettings({
  lobby,
  availablePacks,
  isHost,
  roomCode,
  open,
  onClose,
  isMobile,
  gameMode,
  onGameModeChange,
}: Props) {
  const [winningScore, setWinningScore] = useState(lobby.winningScore);
  const [maxRounds, setMaxRounds] = useState(lobby.maxRounds);
  const [showPackModal, setShowPackModal] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedPackIds, setSelectedPackIds] = useState<Set<number>>(
    new Set(
      lobby.selectedPackIds ??
        availablePacks.filter((p) => p.official).map((p) => p.id),
    ),
  );
  const [houseRules, setHouseRules] = useState<string[]>(
    lobby.houseRules ?? [],
  );
  const [roundTimeoutSeconds, setRoundTimeoutSeconds] = useState(
    lobby.roundTimeoutSeconds ?? DEFAULT_ROUND_TIMEOUT_SECONDS,
  );
  const [votingStyle, setVotingStyle] = useState<VotingStyle>(
    (lobby.modeConfig?.votingStyle as VotingStyle) ?? "czar_votes",
  );
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const hasBots = useMemo(
    () => lobby.players.some((p) => p.isBot),
    [lobby.players],
  );

  useEffect(() => {
    setWinningScore(lobby.winningScore);
    setMaxRounds(lobby.maxRounds);
    setSelectedPackIds(
      new Set(
        lobby.selectedPackIds ??
          availablePacks.filter((p) => p.official).map((p) => p.id),
      ),
    );
    setHouseRules(lobby.houseRules ?? []);
    setRoundTimeoutSeconds(
      lobby.roundTimeoutSeconds ?? DEFAULT_ROUND_TIMEOUT_SECONDS,
    );
    if (lobby.modeConfig?.votingStyle) {
      setVotingStyle(lobby.modeConfig.votingStyle as VotingStyle);
    }
  }, [
    lobby.winningScore,
    lobby.maxRounds,
    lobby.selectedPackIds,
    lobby.houseRules,
    lobby.roundTimeoutSeconds,
    lobby.modeConfig,
    availablePacks,
  ]);

  const emitUpdate = (partial: Record<string, any>) => {
    const socket = getSocket();
    if (socket) socket.emit("lobby:updateSettings", { roomCode, ...partial });
  };

  const debouncedEmit = (partial: Record<string, any>) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(() => emitUpdate(partial), 500));
  };

  const handleScoreChange = (val: number) => {
    const clamped = Math.max(1, Math.min(99, val));
    setWinningScore(clamped);
    debouncedEmit({ winningScore: clamped });
  };

  const handleRoundsChange = (val: number) => {
    const clamped = Math.max(1, Math.min(99, val));
    setMaxRounds(clamped);
    debouncedEmit({ maxRounds: clamped });
  };

  const filteredPacks = availablePacks.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const togglePack = (packId: number) => {
    const next = new Set(selectedPackIds);
    if (next.has(packId)) {
      next.delete(packId);
    } else {
      next.add(packId);
    }
    setSelectedPackIds(next);
  };

  const confirmPacks = () => {
    const ids = [...selectedPackIds];
    emitUpdate({
      selectedPackIds:
        ids.length === availablePacks.filter((p) => p.official).length
          ? null
          : ids,
    });
    setShowPackModal(false);
  };

  const selectAll = () => {
    setSelectedPackIds(new Set(availablePacks.map((p) => p.id)));
  };

  const selectOfficial = () => {
    setSelectedPackIds(
      new Set(availablePacks.filter((p) => p.official).map((p) => p.id)),
    );
  };

  const clearAll = () => {
    setSelectedPackIds(new Set());
  };

  const selectedCount = lobby.selectedPackIds
    ? lobby.selectedPackIds.length
    : availablePacks.filter((p) => p.official).length;
  const selectedLabel =
    lobby.selectedPackIds === null
      ? `Official packs only (${selectedCount} packs)`
      : `${selectedCount} pack${selectedCount !== 1 ? "s" : ""} selected`;

  const content = (
    <div className='bg-surface h-full overflow-y-auto'>
      <div className='p-6 border-b-4 border-primary flex items-center justify-between'>
        <h2 className='text-headline-lg-mobile uppercase tracking-tighter'>
          Game Settings
        </h2>
        {isMobile && (
          <button onClick={onClose} className='p-1 hover:bg-surface-variant'>
            <X className='size-5' />
          </button>
        )}
      </div>

      <div className='p-6 space-y-8'>
        <section>
          <h3 className='text-label-caps uppercase mb-4'>Win Conditions</h3>
          <div className='flex gap-4'>
            <div className='flex-1'>
              <label className='block text-xs font-mono uppercase mb-1'>
                Winning Score
              </label>
              <input
                type='number'
                min={1}
                max={99}
                value={winningScore}
                onChange={(e) =>
                  handleScoreChange(parseInt(e.target.value) || 1)
                }
                disabled={!isHost}
                className='w-full bg-white border-2 border-primary px-3 py-2 font-mono text-sm focus:outline-none focus:border-black disabled:opacity-50'
              />
            </div>
            <div className='flex-1'>
              <label className='block text-xs font-mono uppercase mb-1'>
                Max Rounds
              </label>
              <input
                type='number'
                min={1}
                max={99}
                value={maxRounds}
                onChange={(e) =>
                  handleRoundsChange(parseInt(e.target.value) || 1)
                }
                disabled={!isHost}
                className='w-full bg-white border-2 border-primary px-3 py-2 font-mono text-sm focus:outline-none focus:border-black disabled:opacity-50'
              />
            </div>
          </div>
        </section>

        <section>
          <h3 className='text-label-caps uppercase mb-4'>Card Packs</h3>
          <p className='font-mono text-sm mb-3'>{selectedLabel}</p>
          <Button
            variant='brutalist'
            size='sm'
            disabled={!isHost}
            onClick={() => setShowPackModal(true)}
            className='!rounded-none !font-mono brutal-shadow-sm'
          >
            Change
          </Button>
        </section>

        <section>
          <h3 className='text-label-caps uppercase mb-4'>Game Mode</h3>
          <div className='grid grid-cols-2 gap-2'>
            {[
              { value: "normal", label: "Normal", desc: "Standard CAH rules" },
              {
                value: "blank_only",
                label: "Blank Only",
                desc: "Submit your own answers only, no real cards.",
              },
              {
                value: "rando_cardrissian",
                label: "Rando Cardrissian",
                desc: "Random card joins each round: if picked, no one wins",
              },
              {
                value: "czar_is_dead",
                label: "Czar Is Dead",
                desc: "No czar. Everyone votes for their favourite submission.",
              },
            ].map((mode) => {
              const isBlockedByBots =
                mode.value === "blank_only" && hasBots;
              const isDisabled = !isHost;
              return (
                <button
                  key={mode.value}
                  disabled={isDisabled}
                  className={`text-left p-3 border-2 font-mono text-xs transition-all ${
                    gameMode === mode.value
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-gray-300 hover:border-black"
                  } ${
                    isDisabled || isBlockedByBots
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer"
                  }`}
                  onClick={() => {
                    if (!isHost || gameMode === mode.value) return;
                    if (mode.value === "blank_only" && hasBots) {
                      toast.error("Remove bots to use Blank Only mode");
                      return;
                    }
                    const nextMode = mode.value as GameMode;
                    onGameModeChange(nextMode);
                    let hr = houseRules;
                    if (
                      nextMode === "czar_is_dead" &&
                      hr.includes("next_winner_czar")
                    ) {
                      hr = hr.filter((r) => r !== "next_winner_czar");
                      setHouseRules(hr);
                    }
                    if (nextMode !== "blank_only") {
                      setVotingStyle("czar_votes");
                      emitUpdate({
                        gameMode: nextMode,
                        houseRules: hr,
                        modeConfig: {},
                      });
                    } else {
                      emitUpdate({ gameMode: nextMode, houseRules: hr });
                    }
                  }}
                >
                  <div className='font-bold text-sm'>{mode.label}</div>
                  <div className='mt-1 opacity-70'>{mode.desc}</div>
                </button>
              );
            })}
          </div>

          {gameMode === "blank_only" && (
            <div className='mt-4'>
              <h4 className='text-label-caps uppercase mb-2 text-xs'>
                Voting Style
              </h4>
              <div className='flex gap-2'>
                <button
                  onClick={() => {
                    if (!isHost) return;
                    setVotingStyle("czar_votes");
                    emitUpdate({ modeConfig: { votingStyle: "czar_votes" } });
                  }}
                  disabled={!isHost}
                  className={`flex-1 py-2 px-3 border-2 font-mono text-xs transition-all ${
                    votingStyle === "czar_votes"
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-gray-300 hover:border-black"
                  } disabled:opacity-50`}
                >
                  Czar picks
                </button>
                <button
                  onClick={() => {
                    if (!isHost) return;
                    setVotingStyle("all_votes");
                    emitUpdate({ modeConfig: { votingStyle: "all_votes" } });
                    let hr = houseRules;
                    if (hr.includes("next_winner_czar")) {
                      hr = hr.filter((r) => r !== "next_winner_czar");
                      setHouseRules(hr);
                    }
                    emitUpdate({
                      modeConfig: { votingStyle: "all_votes" },
                      houseRules: hr,
                    });
                  }}
                  disabled={!isHost}
                  className={`flex-1 py-2 px-3 border-2 font-mono text-xs transition-all ${
                    votingStyle === "all_votes"
                      ? "bg-black text-white border-black"
                      : "bg-white text-black border-gray-300 hover:border-black"
                  } disabled:opacity-50`}
                >
                  Everyone votes
                </button>
              </div>
            </div>
          )}
        </section>

        <section>
          <h3 className='text-label-caps uppercase mb-4'>House Rules</h3>
          <label className='flex items-center gap-3 cursor-pointer select-none'>
            <input
              type='checkbox'
              checked={houseRules.includes("blank_cards")}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...houseRules, "blank_cards"]
                  : houseRules.filter((r) => r !== "blank_cards");
                setHouseRules(next);
                debouncedEmit({ houseRules: next });
              }}
              disabled={!isHost || gameMode === "blank_only"}
              className='size-5 accent-black'
            />
            <Tooltip>
              <TooltipTrigger>
                <span
                  className={`font-mono text-sm ${
                    gameMode === "blank_only" ? "opacity-40" : ""
                  }`}
                >
                  Blank Cards
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Each round, players have a chance to draw a blank card they
                fill in with their own answer.
              </TooltipContent>
            </Tooltip>
          </label>

          <label className='flex items-center gap-3 cursor-pointer select-none mt-3'>
            <input
              type='checkbox'
              checked={houseRules.includes("timed_rounds")}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...houseRules, "timed_rounds"]
                  : houseRules.filter((r) => r !== "timed_rounds");
                setHouseRules(next);
                debouncedEmit({ houseRules: next });
              }}
              disabled={!isHost}
              className='size-5 accent-black'
            />
            <Tooltip>
              <TooltipTrigger>
                <span className='font-mono text-sm'>Timed Rounds</span>
              </TooltipTrigger>
              <TooltipContent>
                Each round has a countdown. Players must submit their answers before time runs out.
              </TooltipContent>
            </Tooltip>
          </label>
          {houseRules.includes("timed_rounds") && (
            <div className='ml-8 mt-2'>
              <label className='block text-xs font-mono uppercase mb-1'>
                Timeout (seconds)
              </label>
              <input
                type='number'
                min={3}
                max={300}
                value={roundTimeoutSeconds}
                onChange={(e) => {
                  const val = Math.max(
                    3,
                    Math.min(
                      300,
                      parseInt(e.target.value) || DEFAULT_ROUND_TIMEOUT_SECONDS,
                    ),
                  );
                  setRoundTimeoutSeconds(val);
                  debouncedEmit({ roundTimeoutSeconds: val });
                }}
                disabled={!isHost}
                className='w-full bg-white border-2 border-primary px-3 py-2 font-mono text-sm focus:outline-none focus:border-black disabled:opacity-50'
              />
            </div>
          )}

          <label className='flex items-center gap-3 select-none mt-3 relative'>
            <Tooltip>
              <TooltipTrigger>
                <div className='flex items-center gap-3 cursor-pointer'>
                  <input
                    type='checkbox'
                    checked={houseRules.includes("next_winner_czar")}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...houseRules, "next_winner_czar"]
                        : houseRules.filter((r) => r !== "next_winner_czar");
                      setHouseRules(next);
                      debouncedEmit({ houseRules: next });
                    }}
                    disabled={
                      !isHost ||
                      gameMode === "czar_is_dead" ||
                      (gameMode === "blank_only" && votingStyle === "all_votes")
                    }
                    className='size-5 accent-black'
                  />
                  <span
                    className={`font-mono text-sm ${
                      gameMode === "czar_is_dead" ||
                      (gameMode === "blank_only" && votingStyle === "all_votes")
                        ? "opacity-40"
                        : ""
                    }`}
                  >
                    Winner Becomes Czar
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                The winner of each round becomes the Czar for the next round.
                {(gameMode === "czar_is_dead" ||
                  (gameMode === "blank_only" &&
                    votingStyle === "all_votes")) &&
                  " (Disabled: no czar in this mode)"}
              </TooltipContent>
            </Tooltip>
          </label>
        </section>
      </div>

      <Dialog
        open={showPackModal}
        onOpenChange={(open) => {
          if (!open) setShowPackModal(false);
        }}
      >
        <DialogContent
          className='!rounded-none !border-4 !border-primary !bg-white !p-0 max-w-lg !ring-0 !gap-0 w-[calc(100%-2rem)]'
          showCloseButton={false}
        >
          <DialogTitle className='sr-only'>Select Card Packs</DialogTitle>

          <div className='p-4 border-b-4 border-primary flex items-center justify-between'>
            <h2 className='text-headline-lg-mobile uppercase tracking-tighter'>
              Select Card Packs
            </h2>
            <button
              onClick={() => setShowPackModal(false)}
              className='p-1 hover:bg-surface-variant'
            >
              <X className='size-5' />
            </button>
          </div>

          <div className='p-4 border-b-2 border-primary'>
            <div className='relative mb-3'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 size-4' />
              <input
                className='w-full bg-white border-2 border-primary pl-9 pr-3 py-2 font-mono text-sm focus:outline-none focus:border-black'
                placeholder='Search packs...'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className='flex gap-2'>
              <button
                onClick={selectAll}
                className='bg-black text-white px-3 py-1 text-xs font-bold uppercase btn-press brutal-shadow-sm'
              >
                All
              </button>
              <button
                onClick={selectOfficial}
                className='bg-black text-white px-3 py-1 text-xs font-bold uppercase btn-press brutal-shadow-sm'
              >
                Official Only
              </button>
              <button
                onClick={clearAll}
                className='border-2 border-black px-3 py-1 text-xs font-bold uppercase'
              >
                Clear
              </button>
            </div>
          </div>

          <div className='max-h-[50vh] overflow-y-auto p-4 space-y-1'>
            {filteredPacks.map((pack) => (
              <label
                key={pack.id}
                className='flex items-center gap-3 p-2 hover:bg-surface-variant cursor-pointer select-none'
              >
                <input
                  type='checkbox'
                  checked={selectedPackIds.has(pack.id)}
                  onChange={() => togglePack(pack.id)}
                  className='size-4 accent-black'
                />
                <span className='font-mono text-sm flex-1'>{pack.name}</span>
                {pack.official && (
                  <span className='text-[10px] uppercase tracking-wider font-bold text-secondary'>
                    Official
                  </span>
                )}
              </label>
            ))}
            {filteredPacks.length === 0 && (
              <p className='font-mono text-sm text-secondary text-center py-8'>
                No packs match your search
              </p>
            )}
          </div>

          <div className='p-4 border-t-4 border-primary flex gap-3'>
            <Button
              variant='outline'
              onClick={() => setShowPackModal(false)}
              className='!rounded-none !font-mono flex-1'
            >
              Cancel
            </Button>
            <Button
              variant='brutalist'
              onClick={confirmPacks}
              className='!rounded-none !font-mono brutal-shadow-sm flex-1'
            >
              Confirm ({selectedPackIds.size})
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  if (isMobile) {
    return (
      <div
        className={`fixed inset-0 z-50 flex justify-end ${
          open ? "visible" : "invisible"
        } transition-all duration-300`}
      >
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}
          onClick={onClose}
        />
        <div
          className={`relative w-80 max-w-[85vw] h-full transition-transform duration-300 ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {content}
        </div>
      </div>
    );
  }

  if (!open) return null;

  return content;
}
