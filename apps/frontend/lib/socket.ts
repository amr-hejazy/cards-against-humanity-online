import { io, Socket } from "socket.io-client";

export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000";

// socket instance for the entire app
let socket: Socket | null = null;
let currentToken: string | null = null;

// Initialize the socket connection with the server
export const connectSocket = (token: string) => {
  if (socket?.connected && currentToken === token) return socket;
  socket?.disconnect();
  currentToken = token;
  socket = io(SERVER_URL, { auth: { token } });
  return socket;
};

// Get the current socket instance
export const getSocket = (): Socket | null => {
  return socket;
};

// Disconnect the socket connection
export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};
