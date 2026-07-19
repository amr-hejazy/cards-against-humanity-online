import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../lib/store";
import { getSocket } from "../../lib/socket";
import { LogOut } from "lucide-react";
// import { Settings, HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";

export default function GameTopBar() {
  const navigate = useNavigate();
  const lobbyRoomCode = useStore((s) => s.lobbyRoomCode);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const handleLeave = () => {
    const socket = getSocket();
    if (socket) socket.emit("lobby:leave", { roomCode: lobbyRoomCode });
    useStore.getState().setLobbyRoomCode(null);
    navigate("/");
  };

  return (
    <>
      <header className='fixed top-0 left-0 right-0 h-24 bg-background border-b-4 border-primary z-50 flex items-center justify-between px-6 md:px-10'>
        <span className='font-display text-headline-lg-mobile md:text-headline-lg uppercase tracking-tighter'>
          CARDS AGAINST HUMANITY
        </span>
        <div className='flex items-center gap-3'>
          <button
            onClick={() => setLeaveOpen(true)}
            className='lg:hidden hover:bg-surface-variant p-2 transition-transform duration-75 active:translate-y-1'
          >
            <LogOut className='w-6 h-6' />
          </button>
          {/* Settings and HelpCircle buttons removed — unused */}
        </div>
      </header>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent className='!rounded-none !border-4 !border-primary !bg-white !p-6 max-w-sm !ring-0'>
          <DialogTitle className='font-display text-headline-lg uppercase tracking-tight'>
            LEAVE GAME?
          </DialogTitle>
          <DialogDescription className='font-body-md text-body-md text-foreground mt-2'>
            Are you sure you want to leave? Your cards will be forfeited.
          </DialogDescription>
          <DialogFooter className='!border-0 !bg-transparent !p-0 !mt-6 !flex-row gap-3'>
            <button
              type='button'
              className='flex-1 bg-primary text-primary-foreground px-4 py-3 font-bold uppercase btn-press hover:-translate-y-0.5 transition-all'
              onClick={() => {
                handleLeave();
                setLeaveOpen(false);
              }}
            >
              YES, LEAVE
            </button>
            <button
              type='button'
              className='flex-1 bg-white text-primary border-4 border-primary px-4 py-3 font-bold uppercase btn-press hover:-translate-y-0.5 transition-all'
              onClick={() => setLeaveOpen(false)}
            >
              CANCEL
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
