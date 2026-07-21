import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { SERVER_URL, getSocket } from "../lib/socket";
import { useStore } from "../lib/store";
import { ArrowRight, HelpCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { TermsModal, BuyGameModal } from "../components/LegalModals";
import HowToPlayModal from "../components/HowToPlayModal";

export default function HomePage() {
  // Access the token, username, setAuth, hasSetUsername from the store
  const { token, userId, username, setAuth, hasSetUsername } = useStore();
  // Local state for the room code input and loading state
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(!token);
  const [usernameInput, setUsernameInput] = useState("");
  const [isSettingUsername, setIsSettingUsername] = useState(false);
  const [showUsernameInput, setShowUsernameInput] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showBuy, setShowBuy] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    // call the /auth/me endpoint to validate the token (ensure it's not expired n stuff). If the token is invalid, reset the store to clear it out.
    if (token) {
      setLoading(true);
      axios
        .get(`${SERVER_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        .then(() => setLoading(false))
        .catch((err) => {
          if (err?.response?.status === 401) {
            useStore.getState().reset();
          } else {
            setLoading(false);
          }
        });
      return;
    }

    // TODO: figure out a better way to handle guest auth to prevent constant db writes (eg. someone comes to the site, leaves, comes back, leaves, comes back, etc.)
    setLoading(true);
    axios
      .post(`${SERVER_URL}/auth/guest`)
      .then(({ data: res }) => {
        const { user, token } = res.data;
        setAuth(token, user.id, user.username, false);
      })
      .catch((err) => {
        toast.error("ERROR", {
          description: err?.response?.data?.error?.message || err.message,
          id: "auth-error",
          dismissible: true,
        });
      })
      .finally(() => setLoading(false));
  }, [token, setAuth]);

  // Handle ?join param — redirect from invite link after auth completes
  const [searchParams] = useSearchParams();
  const joinCode = searchParams.get("join");

  useEffect(() => {
    if (loading) return;
    if (!joinCode) return;

    // Clear any stale lobby association
    useStore.getState().setLobbyRoomCode(null);
    useStore.getState().setLobby(null);

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      toast.error("ERROR", {
        description: "Failed to join lobby. Connection timed out.",
        id: "join-timeout",
        dismissible: true,
      });
    }, 10000);

    const tryJoin = () => {
      if (cancelled) return;
      const socket = getSocket();
      if (socket?.connected) {
        clearTimeout(timeout);
        socket.emit("lobby:join", { roomCode: joinCode });
        // Clean URL: remove ?join param
        window.history.replaceState(null, "", "/");
        return;
      }
      setTimeout(tryJoin, 200);
    };
    tryJoin();

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [loading, joinCode]);

  // emits an event to the server to create a new lobby
  const createLobby = () => {
    const socket = getSocket();
    if (socket) socket.emit("lobby:create", { maxPlayers: 10 });
  };

  // emits an event to the server to join an existing lobby
  const joinLobby = () => {
    if (!roomCode.trim()) return;
    const socket = getSocket();
    if (socket) socket.emit("lobby:join", { roomCode: roomCode.trim() });
  };

  const handleRoomInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
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

  return (
    <div className="viewport-frame flex flex-col items-center justify-between p-5 md:p-10 overflow-hidden">
      <header className="w-full flex justify-between items-center px-4 md:px-0 py-4 border-b-4 border-primary">
        <span className="font-sans text-headline-lg uppercase tracking-tighter text-foreground">
          CARDS AGAINST HUMANITY
        </span>
        <div className="flex gap-4">
          <button
            className="hover:opacity-60 transition-opacity"
            onClick={() => setShowRules(true)}
            aria-label="How to play"
          >
            <HelpCircle className="size-6" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl space-y-16 py-12">
        <section className="text-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <h1 className="font-sans text-7xl md:text-9xl uppercase tracking-tighter leading-none select-none">
            CARDS<br />AGAINST<br />HUMANITY
          </h1>

          <div className="flex flex-col items-center gap-12 pt-8">
            <button
              className="group relative bg-primary text-white px-12 py-6 border-4 border-white brutal-shadow brutal-shadow-hover transition-all duration-75"
              onClick={createLobby}
            >
              <span className="text-headline-lg uppercase tracking-tight">Create Game</span>
            </button>

            <div className="w-full max-w-md space-y-6">
              <div className="flex flex-col items-center gap-4">
                <label className="text-label-caps uppercase text-[#5d5f5f]" htmlFor="room-code">
                  Enter Room Code
                </label>
                <div className="flex w-full max-sm:max-w-[280px] gap-0">
                  <input
                    id="room-code"
                    className="min-w-0 flex-1 bg-surface border-4 border-primary px-6 py-4 font-mono text-3xl text-center uppercase tracking-widest focus:ring-0 focus:outline-none focus:border-black placeholder:opacity-20"
                    placeholder="XXXXXX"
                    maxLength={6}
                    value={roomCode}
                    onChange={handleRoomInput}
                    onKeyDown={(e) => e.key === "Enter" && joinLobby()}
                  />
                  <button
                    className="flex-shrink-0 bg-primary text-white px-8 py-4 transition-all hover:bg-on-primary-container active:translate-y-1 disabled:opacity-50"
                    onClick={joinLobby}
                    disabled={!roomCode.trim()}
                  >
                    <ArrowRight className="size-9" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full flex flex-col md:flex-row justify-between items-center py-6 border-t border-on-primary-container md:border-t-4 md:border-primary gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="size-3 bg-green-600 rounded-full animate-pulse border border-black" />
            <p className="font-mono text-sm tracking-tighter opacity-70">
              {loading ? (
                "Connecting..."
              ) : (
                <>
                  <span>Username: </span>
                  {hasSetUsername ? (
                    <span className="font-bold underline decoration-2">{username}</span>
                  ) : (
                    <span>No username set</span>
                  )}
                </>
              )}
            </p>
            {!loading && (
              <Button
                variant="brutalist"
                size="xs"
                className="!rounded-none !px-2 !py-0.5 !text-[10px] !leading-none !uppercase !tracking-wider !font-mono brutal-shadow-sm"
                onClick={() => setShowUsernameInput((v) => !v)}
              >
                {hasSetUsername ? "Change" : "Set"}
              </Button>
            )}
          </div>

          <div
            className="grid transition-all duration-300"
            style={{
              gridTemplateRows: showUsernameInput ? "1fr" : "0fr",
              opacity: showUsernameInput ? 1 : 0,
            }}
          >
            <div className="overflow-hidden flex items-center gap-2">
              <input
                className="bg-surface border-2 border-primary px-3 py-1.5 font-mono text-sm focus:ring-0 focus:outline-none focus:border-black min-w-0 flex-1"
                placeholder="Enter username"
                maxLength={30}
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSetUsername()}
                disabled={isSettingUsername}
              />
              <Button
                variant="brutalist"
                size="sm"
                className="!rounded-none !font-mono brutal-shadow-sm"
                onClick={handleSetUsername}
                disabled={!usernameInput.trim() || isSettingUsername}
              >
                {isSettingUsername ? "..." : "Set"}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-8 text-label-caps uppercase text-[#5d5f5f]">
          <button
            className="hover:text-black hover:underline transition-colors"
            onClick={() => setShowTerms(true)}
          >
            Terms
          </button>
          <button
            className="hover:text-black hover:underline transition-colors"
            onClick={() => setShowBuy(true)}
          >
            Buy Physical Game
          </button>
        </div>
      </footer>

      <TermsModal open={showTerms} onClose={() => setShowTerms(false)} />
      <BuyGameModal open={showBuy} onClose={() => setShowBuy(false)} />
      <HowToPlayModal open={showRules} onClose={() => setShowRules(false)} />
    </div>
  );
}
