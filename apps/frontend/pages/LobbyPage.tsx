import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { SERVER_URL, getSocket } from "../lib/socket";
import { Button } from "../components/ui/button";
import {
  Copy,
  Check,
  Play,
  LogOut,
  Swords,
  BookOpen,
  UserPlus,
  X,
  HelpCircle,
} from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../components/ui/tooltip";
import { toast } from "sonner";
import RulesModal from "../components/RulesModal";
import type { GameMode, PackInfo } from "@cah/shared";
import LobbySettings from "../components/LobbySettings";
import { Settings } from "lucide-react";

export default function LobbyPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const lobby = useStore((s) => s.lobby);
  const userId = useStore((s) => s.userId);
  const socketConnected = useStore((s) => s.socketConnected);
  const username = useStore((s) => s.username);
  const token = useStore((s) => s.token);
  const setAuth = useStore((s) => s.setAuth);
  const hasSetUsername = useStore((s) => s.hasSetUsername);
  const navigate = useNavigate();
  const isReady = lobby?.players.find((p) => p.userId === userId)?.isReady;
  const isHost = lobby?.hostUserId === userId;
  const [hostBanner, setHostBanner] = useState(false);
  const prevHostId = useRef(lobby?.hostUserId);
  const [readyPending, setReadyPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [showUsernameInput, setShowUsernameInput] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [isSettingUsername, setIsSettingUsername] = useState(false);
  const [availablePacks, setAvailablePacks] = useState<PackInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedGameMode, setSelectedGameMode] = useState<GameMode>("normal");

  useEffect(() => {
    setReadyPending(false);
  }, [lobby]);

  useEffect(() => {
    if (lobby) setSelectedGameMode(lobby.gameMode);
  }, [lobby?.gameMode]);

  useEffect(() => {
    if (!readyPending) return;
    const t = setTimeout(() => setReadyPending(false), 5000);
    return () => clearTimeout(t);
  }, [readyPending]);

  useEffect(() => {
    if (!roomCode) return;
    if (!userId) {
      useStore.getState().setLobbyRoomCode(null);
      navigate("/?join=" + roomCode, { replace: true });
      return;
    }
    if (lobby && lobby.roomCode !== roomCode) {
      navigate("/lobby/" + lobby.roomCode, { replace: true });
      return;
    }
    if (lobby && lobby.roomCode === roomCode) return;
    useStore.getState().setLobbyRoomCode(null);
    let cancelled = false;
    const tryJoin = () => {
      if (cancelled) return;
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit("lobby:join", { roomCode });
        return;
      }
      setTimeout(tryJoin, 200);
    };
    tryJoin();
    const t = setTimeout(() => {
      if (cancelled) return;
      const current = useStore.getState().lobby;
      if (!current || current.roomCode !== roomCode) {
        navigate("/", { replace: true });
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [roomCode, userId, lobby, navigate]);

  useEffect(() => {
    const prev = prevHostId.current;
    prevHostId.current = lobby?.hostUserId;
    if (prev && prev !== lobby?.hostUserId && lobby?.hostUserId === userId) {
      setHostBanner(true);
      const t = setTimeout(() => setHostBanner(false), 5000);
      return () => clearTimeout(t);
    }
  }, [lobby?.hostUserId, userId]);

  useEffect(() => {
    let cancelled = false;
    if (lobby) {
      axios.get(`${SERVER_URL}/packs`).then(({ data }) => {
        if (!cancelled) setAvailablePacks(data.packs);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [lobby]);

  const copyInviteLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReady = () => {
    setReadyPending(true);
    const socket = getSocket();
    if (socket) socket.emit("lobby:ready", { isReady: !isReady });
  };

  const handleStartGame = () => {
    const socket = getSocket();
    if (socket) socket.emit("game:start", { roomCode, gameMode: selectedGameMode });
  };

  const handleLeave = () => {
    const socket = getSocket();
    if (socket) socket.emit("lobby:leave", { roomCode });
  };

  const handleSetUsername = async () => {
    if (!usernameInput.trim()) return;
    if (usernameInput.trim() === username) {
      toast("That's already what you are.");
      return;
    }
    setIsSettingUsername(true);
    try {
      const { data: res } = await axios.patch(
        `${SERVER_URL}/auth/username`,
        { username: usernameInput.trim() },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setAuth(token!, userId!, res.data.username, true);
      const currentLobby = useStore.getState().lobby;
      if (currentLobby) {
        useStore.getState().setLobby({
          ...currentLobby,
          players: currentLobby.players.map((p) =>
            p.userId === userId ? { ...p, username: res.data.username } : p,
          ),
        });
      }
      toast.success("Username set!");
      setShowUsernameInput(false);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err.message;
      toast.error("ERROR", {
        description: msg,
        id: "set-username-error",
        dismissible: true,
      });
    } finally {
      setIsSettingUsername(false);
    }
  };

  const startDisabledReason = !isHost
    ? null
    : lobby.players.length < 3
    ? "Need at least 3 players"
    : !lobby.players.every((p) => p.isReady)
    ? "Waiting for players to ready up"
    : null;

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  if (!lobby) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background'>
        <div className='bg-white border-4 border-black p-8 brutal-shadow-md'>
          <p className='text-headline-lg uppercase animate-pulse'>
            Loading lobby...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-background'>
      <header className='w-full bg-background border-b-4 border-primary flex justify-between items-center px-6 md:px-12 py-4 z-40 fixed top-0'>
        <span className='text-headline-lg-mobile md:text-headline-lg uppercase tracking-tighter text-foreground'>
          CARDS AGAINST HUMANITY
        </span>
        <div className='flex gap-4'>
          {/* Help button removed — unused */}
          {/* Settings button removed — unused */}
        </div>
      </header>

      <nav className='hidden lg:flex flex-col w-64 h-screen fixed left-0 top-0 pt-24 bg-surface border-r-4 border-primary z-30'>
        <div className='p-6 border-b-2 border-primary mb-4'>
          <h2 className='text-headline-lg-mobile text-on-surface uppercase tracking-tighter'>
            Game Room #{roomCode}
          </h2>
        </div>
        <ul className='flex flex-col gap-2 px-4'>
          <li className='bg-primary text-primary-foreground font-bold flex items-center gap-3 p-4 cursor-pointer select-none'>
            <Swords className='size-5' />
            Game Lobby
          </li>
          <li
            className='text-on-surface hover:bg-secondary-container transition-colors flex items-center gap-3 p-4 cursor-pointer select-none'
            onClick={() => setRulesOpen(true)}
          >
            <BookOpen className='size-5' />
            How To Play
          </li>
        </ul>
        <div className='mt-auto border-t-2 border-primary p-4'>
          <div className='flex items-center gap-2'>
            <div className='size-2.5 bg-green-600 rounded-full animate-pulse border border-black shrink-0' />
            <p className='font-mono text-sm tracking-tighter min-w-0 flex-1 truncate'>
              <span>Username: </span>
              {hasSetUsername ? (
                <span className='font-bold underline decoration-2'>{username}</span>
              ) : (
                <span>No username set</span>
              )}
            </p>
            <Button
              variant='brutalist'
              size='xs'
              className='!rounded-none !px-2 !py-0.5 !text-[10px] !leading-none !uppercase !tracking-wider !font-mono brutal-shadow-sm shrink-0'
              onClick={() => setShowUsernameInput(v => !v)}
            >
              {hasSetUsername ? 'Change' : 'Set'}
            </Button>
          </div>
          <div
            className='grid transition-all duration-300'
            style={{
              gridTemplateRows: showUsernameInput ? '1fr' : '0fr',
              opacity: showUsernameInput ? 1 : 0,
            }}
          >
            <div className='overflow-hidden flex items-center gap-2 pt-2'>
              <input
                className='min-w-0 flex-1 bg-white border-2 border-primary px-2 py-1.5 font-mono text-sm focus:outline-none focus:border-black'
                placeholder='Enter username'
                maxLength={30}
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSetUsername()}
                disabled={isSettingUsername}
              />
              <Button
                variant='brutalist'
                size='sm'
                className='!rounded-none !font-mono brutal-shadow-sm'
                onClick={handleSetUsername}
                disabled={!usernameInput.trim() || isSettingUsername}
              >
                {isSettingUsername ? '...' : 'Set'}
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className='flex min-h-screen pt-28 pb-28 lg:ml-64 lg:mr-80'>
        <main className='flex-1 px-6 md:px-12'>
          <div className='max-w-4xl mx-auto space-y-8'>
            {!socketConnected && (
            <div className='bg-black text-white p-4 border-4 border-black flex items-center gap-3 animate-pulse'>
              <span className='font-bold text-lg shrink-0'>!</span>
              <span className='text-label-caps'>
                CONNECTION LOST — RECONNECTING...
              </span>
            </div>
          )}

          {hostBanner && (
            <div className='bg-black text-white p-4 border-4 border-black flex items-center gap-3'>
              <span className='font-bold text-lg shrink-0'>★</span>
              <span className='text-label-caps'>YOU ARE NOW HOST</span>
            </div>
          )}

          <section>
            <div className='bg-white border-4 border-black p-8 md:p-10 brutal-shadow-md text-center'>
              <span className='text-label-caps block mb-2'>
                SHARE THIS CODE TO INVITE PLAYERS
              </span>
              <h1 className='text-[48px] md:text-[72px] font-black tracking-tighter leading-none mb-6 uppercase'>
                Game Code:{" "}
                <span className='bg-black text-white px-4'>{roomCode}</span>
              </h1>
              <div className='flex justify-center gap-4'>
                <button
                  className='bg-black text-white px-6 py-3 font-bold uppercase btn-press brutal-shadow-sm flex items-center gap-2 transition-all'
                  onClick={copyInviteLink}
                >
                  {copied ? (
                    <>
                      <Check className='size-4' /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className='size-4' /> Copy Link
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          <section>
            <h2 className='text-headline-lg uppercase mb-6'>
              Players ({lobby.players.length}/{lobby.maxPlayers})
            </h2>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              {lobby.players.map((p) => (
                <div
                  key={p.userId}
                  className='bg-white border-4 border-black p-4 flex items-center gap-4 brutal-shadow-sm'
                >
                  <div className='w-12 h-12 bg-black text-white flex items-center justify-center font-bold shrink-0 text-lg'>
                    {getInitials(p.username)}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                      <p className='font-bold truncate'>{p.username}</p>
                      {p.isBot && (
                        <span className='bg-black text-white text-[10px] px-1.5 py-0.5 font-bold uppercase'>BOT</span>
                      )}
                    </div>
                    <p className='text-xs uppercase text-secondary'>
                      {p.userId === lobby.hostUserId &&
                        p.isReady &&
                        "Host • Ready"}
                      {p.userId === lobby.hostUserId &&
                        !p.isReady &&
                        "Host • Not Ready"}
                      {p.userId !== lobby.hostUserId && p.isReady && "Ready"}
                      {p.userId !== lobby.hostUserId &&
                        !p.isReady &&
                        "Not Ready"}
                    </p>
                  </div>
                  {isHost && p.isBot && (
                    <button
                      onClick={() => getSocket()?.emit("lobby:removeBot", { roomCode, botUserId: p.userId })}
                      className='hover:bg-surface-variant p-1 transition-colors'
                    >
                      <X className='size-4' />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className='flex flex-col md:flex-row gap-4 items-center justify-center'>
            <Button
              variant={isReady ? "outline" : "brutalist"}
              size='lg'
              disabled={readyPending}
              onClick={handleReady}
              className='!rounded-none !border-4 !px-8 !py-6 !text-lg !font-bold uppercase flex items-center gap-2'
            >
              {isReady ? "Not Ready" : "Ready Up"}
            </Button>

            {isHost && lobby.status === "WAITING" && (
              <>
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      variant='brutalist'
                      size='lg'
                      disabled={!!startDisabledReason}
                      onClick={handleStartGame}
                      className={`!rounded-none !border-4 !px-8 !py-6 !text-headline-lg !font-bold uppercase flex items-center gap-3 ${startDisabledReason ? 'opacity-50 pointer-events-none' : ''}`}
                      aria-disabled={!!startDisabledReason}
                    >
                      Start Game <Play className='size-6' />
                    </Button>
                  </TooltipTrigger>
                  {startDisabledReason && (
                    <TooltipContent className='!rounded-none !border-2 !border-primary bg-black text-white text-xs font-bold uppercase tracking-wider px-3 py-2'>
                      {startDisabledReason}
                    </TooltipContent>
                  )}
                </Tooltip>
                <Button
                  variant='outline'
                  size='lg'
                  disabled={lobby.players.length >= lobby.maxPlayers}
                  onClick={() => {
                    if (selectedGameMode === "blank_only") {
                      toast.error(
                        "Bots aren't supported in Blank Only mode — switch game mode first",
                      );
                      return;
                    }
                    getSocket()?.emit("lobby:addBot", { roomCode });
                  }}
                  className='!rounded-none !border-4 !px-8 !py-6 !text-lg !font-bold uppercase flex items-center gap-2'
                >
                  <UserPlus className='size-5' /> Add Bot
                </Button>
              </>
            )}

            <Button
              variant='outline'
              size='lg'
              onClick={handleLeave}
              className='!rounded-none !border-4 !px-8 !py-6 !text-lg !font-bold uppercase flex items-center gap-2'
            >
              <LogOut className='size-5' /> Leave Room
            </Button>
          </section>

          <section className='block lg:hidden border-t-2 border-primary pt-6'>
            <div className='flex items-center gap-3'>
              <div className='size-3 bg-green-600 rounded-full animate-pulse border border-black shrink-0' />
              <p className='font-mono text-sm tracking-tighter'>
                <span>Username: </span>
                {hasSetUsername ? (
                  <span className='font-bold underline decoration-2'>{username}</span>
                ) : (
                  <span>No username set</span>
                )}
              </p>
              <Button
                variant='brutalist'
                size='xs'
                className='!rounded-none !px-2 !py-0.5 !text-[10px] !leading-none !uppercase !tracking-wider !font-mono brutal-shadow-sm ml-auto'
                onClick={() => setShowUsernameInput(v => !v)}
              >
                {hasSetUsername ? 'Change' : 'Set'}
              </Button>
            </div>
            <div
              className='grid transition-all duration-300'
              style={{
                gridTemplateRows: showUsernameInput ? '1fr' : '0fr',
                opacity: showUsernameInput ? 1 : 0,
              }}
            >
              <div className='overflow-hidden flex items-center gap-2 pt-2'>
                <input
                  className='min-w-0 flex-1 bg-white border-2 border-primary px-3 py-2 font-mono text-sm focus:outline-none focus:border-black'
                  placeholder='Enter username'
                  maxLength={30}
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSetUsername()}
                  disabled={isSettingUsername}
                />
                <Button
                  variant='brutalist'
                  size='sm'
                  className='!rounded-none !font-mono brutal-shadow-sm'
                  onClick={handleSetUsername}
                  disabled={!usernameInput.trim() || isSettingUsername}
                >
                  {isSettingUsername ? '...' : 'Set'}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Desktop settings sidebar */}
      {lobby && (
        <aside className='hidden lg:block fixed right-0 top-0 pt-28 h-screen w-80 border-l-4 border-primary bg-surface z-30'>
          <LobbySettings
            lobby={lobby}
            availablePacks={availablePacks}
            isHost={isHost}
            roomCode={roomCode!}
            open={true}
            onClose={() => {}}
            isMobile={false}
            gameMode={selectedGameMode}
            onGameModeChange={setSelectedGameMode}
          />
        </aside>
      )}
    </div>

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />

      <button
        onClick={() => setSettingsOpen(true)}
        className='lg:hidden fixed bottom-24 right-6 size-14 rounded-full bg-primary text-primary-foreground border-4 border-primary brutal-shadow-md flex items-center justify-center z-50 hover:-translate-y-0.5 active:translate-y-0.5 transition-all'
        aria-label='Settings'
      >
        <Settings className='size-7' />
      </button>

      <button
        onClick={() => setRulesOpen(true)}
        className='lg:hidden fixed bottom-6 right-6 size-14 rounded-full bg-primary text-primary-foreground border-4 border-primary brutal-shadow-md flex items-center justify-center z-50 hover:-translate-y-0.5 active:translate-y-0.5 transition-all'
        aria-label='Rules'
      >
        <HelpCircle className='size-7' />
      </button>

      {/* Mobile settings drawer */}
      {lobby && (
        <LobbySettings
          lobby={lobby}
          availablePacks={availablePacks}
          isHost={isHost}
          roomCode={roomCode!}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          isMobile={true}
          gameMode={selectedGameMode}
          onGameModeChange={setSelectedGameMode}
        />
      )}
    </div>
  );
}
