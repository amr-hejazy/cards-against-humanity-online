import { lobbies, lobbyPlayers } from "../../db/schema";
import { getLobby } from "./lobby.service";

export type Lobby = typeof lobbies.$inferSelect; // infer the type of a lobby from the database schema
export type LobbyPlayer = typeof lobbyPlayers.$inferSelect; // infer the type of a lobby player from the database schema
export type LobbyWithPlayers = NonNullable<
  Awaited<ReturnType<typeof getLobby>>
>; // infer the type of a lobby with players from the return type of getLobby or null if not found
