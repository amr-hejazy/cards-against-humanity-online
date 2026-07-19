import { getSocket } from "../socket";

export function createLobby(roomCode: string, selectedPackIds: number[]) {
  getSocket()?.emit("lobby:create", { roomCode, selectedPackIds });
}

export function setLobbyCardPacks(roomCode: string, selectedPackIds: number[]) {
  getSocket()?.emit("lobby:setCardPacks", { roomCode, selectedPackIds });
}

export function startGame(roomCode: string, gameMode: string) {
  getSocket()?.emit("lobby:startGame", { roomCode, gameMode });
}

export function leaveLobby(roomCode: string) {
  getSocket()?.emit("lobby:leave", { roomCode });
}

export function closeLobby(roomCode: string) {
  getSocket()?.emit("lobby:close", { roomCode });
}
