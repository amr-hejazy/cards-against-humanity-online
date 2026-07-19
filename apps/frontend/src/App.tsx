import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import SocketManager from "../components/SocketManager";
import Toaster from "../components/SonnerToaster";
import MobileNav from "../components/MobileNav";
import HomePage from "../pages/HomePage";
import LobbyPage from "../pages/LobbyPage";
import GamePage from "../pages/GamePage";
import { TooltipProvider } from "../components/ui/tooltip";
import { SERVER_URL } from "../lib/socket";

function LoadingScreen() {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const id = setInterval(
      () => setDots((p) => (p.length < 3 ? p + "." : "")),
      600,
    );
    return () => clearInterval(id);
  }, []);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="bg-white border-4 border-black p-10 md:p-14 brutal-shadow-md text-center max-w-lg">
        <p className="text-headline-lg-mobile md:text-headline-lg uppercase font-black tracking-tighter leading-tight mb-6">
          Loading
          <span className="tabular-nums">{dots}</span>
        </p>
        <p className="text-label-caps uppercase text-[#5d5f5f] leading-relaxed">
          slowly...because...i'm...broke
        </p>
      </div>
    </div>
  );
}

function App() {
  const token = useStore((s) => s.token);
  const [backendReady, setBackendReady] = useState(false);

  // Poll backend health until it responds (cold start on Render free tier)
  useEffect(() => {
    let cancelled = false;

    const check = () => {
      if (cancelled) return;
      fetch(`${SERVER_URL}/ping`, { signal: AbortSignal.timeout(5000) })
        .then((r) => {
          if (r.ok && !cancelled) setBackendReady(true);
        })
        .catch(() => {
          if (!cancelled) setTimeout(check, 2000);
        });
    };
    check();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!backendReady) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <TooltipProvider>
        <Toaster />
        {token && <SocketManager />}
        <Routes>
          <Route path='/' element={<HomePage />} />
          <Route path='/lobby/:roomCode' element={<LobbyPage />} />
          <Route path='/game/:gameId' element={<GamePage />} />
        </Routes>
        <MobileNav />
      </TooltipProvider>
    </BrowserRouter>
  );
}

export default App;
