import { Server, Socket } from "socket.io";
import type {
  JoinGamePayload,
  JudgeSubmissionPayload,
  StartGamePayload,
  SubmitCardsPayload,
  CastVotePayload,
  VoteUpdateDto,
} from "@cah/shared";
import {
  judgeSubmission,
  startGame,
  startNextRound,
  submitCards,
  endGame,
} from "../features/game/game.service";
import { toPlayerGameStateDto } from "../features/game/game.mapper";
import {
  getGameState,
  findActiveGameByUserId,
  resolveGamePlayerId,
  withGameLock,
} from "../features/game/game.state";
import { emitPlayerGameStates, endGameCleanup, setTimedRoundTimer, scheduleAutoAdvance } from "./game.socket.helpers";
import { emitSocketError } from "../core/error/socketErrors";
import { AppError, ErrorTypes } from "../core/error/errors";
import logger from "../core/logger";
import {
  cancelDisconnectCleanup,
  midGameDisconnectGraceMs,
} from "./lobby.socket";
import { lobbyBots } from "../core/game/lobby-bot.state";
import { scheduleBotActions } from "../features/game/game-bot.service";

import {
  gamePlayerSockets,
  socketIdToGamePlayerId,
  clearAutoAdvanceTimeout,
  setAutoAdvanceTimeout,
  clearRoundTimer,
} from "../core/game/game-maps";
import { setVote, getVoteCount } from "../core/game/vote-maps";
import { resolveVoteRound } from "../features/game/game.service";
import { getStrategy } from "../features/game/game-modes";
import { findGameByGameId } from "../features/game/game.state";

export const registerGameHandlers = (io: Server, socket: Socket) => {
  // Handle starting a game
  socket.on("game:start", async (payload: StartGamePayload) => {
    try {
      // 1. Verify the host isn't already in an active game
      const userId = socket.data.userId;
      if (findActiveGameByUserId(userId)) {
        throw new AppError(
          400,
          "Already in a game",
          ErrorTypes.ALREADY_IN_GAME,
        );
      }

      // 1a. Get any bot players in the lobby
      const lobbyId = socket.data.lobbyId;
      const bots = lobbyId ? lobbyBots.getBots(lobbyId) : undefined;

      // 2. Call the service function to start the game
      const { game, state } = await startGame(payload.roomCode, userId, payload.gameMode, bots);

      // 2a. Bots moved to game state — clear from lobby-bot store
      if (lobbyId) lobbyBots.clearLobby(lobbyId);

      // 3. Notify everyone in the lobby room that the game has started
      io.to(`lobby:${game.lobbyId}`).emit("game:started", {
        gameId: game.id,
        roomCode: payload.roomCode,
      });

      // 3a. Schedule bot actions for the newly started game
      scheduleBotActions(
        game.id,
        io,
        gamePlayerSockets,
        socketIdToGamePlayerId,
      );

      // 3b. Set round timer for round 1 if timed rounds enabled
      setTimedRoundTimer(game.id, io, scheduleBotActions, gamePlayerSockets, socketIdToGamePlayerId);

      // Cancel any pending disconnect timeout for the host
      cancelDisconnectCleanup(userId);
    } catch (err) {
      logger.error("game:start error", err);
      emitSocketError(socket, "game:error", "start", err);
    }
  });

  // Handle joining a game
  socket.on("game:join", async (payload: JoinGamePayload) => {
    try {
      // 1. Verify the user isn't already in a different active game
      const userId = socket.data.userId;
      const existingGameId = findActiveGameByUserId(userId);
      if (existingGameId && existingGameId !== payload.gameId) {
        throw new AppError(
          400,
          "Already in a game",
          ErrorTypes.ALREADY_IN_GAME,
        );
      }

      // 2. Get the current in-memory game state
      const state = getGameState(payload.gameId);
      // 3. Resolve the player's game-specific ID from their authenticated user ID
      const gamePlayerId = resolveGamePlayerId(userId);

      if (!gamePlayerId) {
        throw new AppError(
          403,
          "Player not in this game",
          ErrorTypes.PLAYER_NOT_FOUND,
        );
      }

      // 4. User actively joined a game — cancel any pending disconnect timeout
      cancelDisconnectCleanup(userId);
      // 5. Store gameId on socket for disconnect cleanup
      socket.data.gameId = payload.gameId;
      // 6. Join the game's socket room
      await socket.join(`game:${payload.gameId}`);

      // 6. Associate this socket with the player
      let sockets = gamePlayerSockets.get(gamePlayerId);
      if (!sockets) {
        sockets = new Set();
        gamePlayerSockets.set(gamePlayerId, sockets);
      }
      sockets.add(socket.id);
      socketIdToGamePlayerId.set(socket.id, gamePlayerId);

      // 7. Build the player's private game state and send it only to this player
      const dto = toPlayerGameStateDto(state, gamePlayerId);
      socket.emit("game:state", dto);
    } catch (err) {
      logger.error("game:join error", err);
      emitSocketError(socket, "game:error", "join", err);
    }
  });

  // Handle submitting cards
  socket.on("game:submit", async (payload: SubmitCardsPayload) => {
    try {
      // 1. Resolve the player's game-specific ID from their authenticated user ID
      const gamePlayerId = resolveGamePlayerId(socket.data.userId);
      if (!gamePlayerId) {
        throw new AppError(
          403,
          "Player not in this game",
          ErrorTypes.PLAYER_NOT_FOUND,
        );
      }

      const updatedState = await submitCards(
        payload.gameId,
        gamePlayerId,
        payload.whiteCardIds,
        payload.customTexts,
      );

      emitPlayerGameStates(io, updatedState, gamePlayerSockets);

      if (updatedState.currentRound?.status === "VOTING") {
        scheduleBotActions(payload.gameId, io, gamePlayerSockets, socketIdToGamePlayerId);
        return;
      }

      if (updatedState.currentRound?.status === "REVEAL") {
        clearRoundTimer(payload.gameId);
      }

      // 4. Schedule bot actions after submit (bot judge may need to pick)
      scheduleBotActions(
        payload.gameId,
        io,
        gamePlayerSockets,
        socketIdToGamePlayerId,
      );
    } catch (err) {
      logger.error("game:submit error", err);
      emitSocketError(socket, "game:error", "submit", err);
    }
  });

  // Handle judge selecting a winning submission
  socket.on("game:judgeSubmission", async (payload: JudgeSubmissionPayload) => {
    try {
      // 1. Resolve the judge's game-specific ID from their authenticated user ID
      const judgeGamePlayerId = resolveGamePlayerId(socket.data.userId);
      if (!judgeGamePlayerId) {
        throw new AppError(
          403,
          "Player not in this game",
          ErrorTypes.PLAYER_NOT_FOUND,
        );
      }

      const result = await judgeSubmission(
        payload.gameId,
        judgeGamePlayerId,
        payload.winningGamePlayerId,
      );

      if (result.type === "GAME_ENDED") {
        clearAutoAdvanceTimeout(payload.gameId);
        clearRoundTimer(payload.gameId);
        await endGameCleanup(
          io,
          payload.gameId,
          result.results,
          gamePlayerSockets,
          socketIdToGamePlayerId,
        );
        return;
      }

      clearAutoAdvanceTimeout(payload.gameId);
      clearRoundTimer(payload.gameId);

      if (result.type === "NO_WINNER") {
        emitPlayerGameStates(io, result.state, gamePlayerSockets);
        scheduleBotActions(payload.gameId, io, gamePlayerSockets, socketIdToGamePlayerId);
        setTimedRoundTimer(payload.gameId, io, scheduleBotActions, gamePlayerSockets, socketIdToGamePlayerId);
        return;
      }

      emitPlayerGameStates(io, result.state, gamePlayerSockets);

      scheduleAutoAdvance(payload.gameId, io, gamePlayerSockets, socketIdToGamePlayerId, scheduleBotActions);
    } catch (err) {
      logger.error("game:judgeSubmission error", err);
      emitSocketError(socket, "game:error", "judgeSubmission", err);
    }
  });

  // Handle manual start of next round (player clicks "Next Round" button)
  socket.on("game:startNextRound", async (payload: { gameId: string }) => {
    try {
      await withGameLock(payload.gameId, async () => {
        const state = getGameState(payload.gameId);
        if (!state.winnerReveal) {
          throw new AppError(
            400,
            "No winner reveal to advance from",
            ErrorTypes.INVALID_STATE,
          );
        }

        // Cancel the auto-advance timer
        clearAutoAdvanceTimeout(payload.gameId);

        if (state.winnerReveal.isFinalRound) {
          const results = await endGame(
            state,
            state.winnerReveal.gameWinnerId ?? null,
          );
          await endGameCleanup(
            io,
            payload.gameId,
            results,
            gamePlayerSockets,
            socketIdToGamePlayerId,
          );
          return;
        }

        await startNextRound(state);
        emitPlayerGameStates(io, state, gamePlayerSockets);
        scheduleBotActions(
          payload.gameId,
          io,
          gamePlayerSockets,
          socketIdToGamePlayerId,
        );
        setTimedRoundTimer(payload.gameId, io, scheduleBotActions, gamePlayerSockets, socketIdToGamePlayerId);
      });
    } catch (err) {
      logger.error("game:startNextRound error", err);
      emitSocketError(socket, "game:error", "startNextRound", err);
    }
  });

  // Handle voting
  socket.on("game:vote", async (payload: CastVotePayload) => {
    try {
      const voterGpId = resolveGamePlayerId(socket.data.userId);
      if (!voterGpId) {
        throw new AppError(403, "Player not in this game", ErrorTypes.PLAYER_NOT_FOUND);
      }

      const state = findGameByGameId(payload.gameId);
      if (!state || !state.currentRound || state.currentRound.status !== "VOTING") {
        throw new AppError(400, "Round is not accepting votes", ErrorTypes.ROUND_NOT_PLAYING);
      }

      const strategy = getStrategy(state.gameMode);
      const voterIds = strategy.getVoterIds(state, state.currentRound);
      if (!voterIds.includes(voterGpId)) {
        throw new AppError(403, "You are not allowed to vote in this round", ErrorTypes.VALIDATION_ERROR);
      }

      if (voterGpId === payload.chosenGamePlayerId) {
        throw new AppError(400, "Cannot vote for yourself", ErrorTypes.VALIDATION_ERROR);
      }

      if (!state.currentRound.submissions[payload.chosenGamePlayerId]) {
        throw new AppError(400, "Chosen submission does not exist", ErrorTypes.INVALID_SUBMISSION);
      }

      setVote(payload.gameId, state.currentRound.number, voterGpId, payload.chosenGamePlayerId);

      const { submitted } = getVoteCount(payload.gameId, state.currentRound.number);
      const total = voterIds.length;

      io.to(`game:${payload.gameId}`).emit("game:voteUpdate", {
        roundNumber: state.currentRound.number,
        submittedVotes: submitted,
        totalVoters: total,
      } satisfies VoteUpdateDto);

      // Emit full state so voters see hasVoted = true immediately
      emitPlayerGameStates(io, state, gamePlayerSockets);

      if (submitted >= total) {
        const result = await resolveVoteRound(payload.gameId);
        if (result.type === "GAME_ENDED") {
          clearAutoAdvanceTimeout(payload.gameId);
          clearRoundTimer(payload.gameId);
          await endGameCleanup(io, payload.gameId, result.results, gamePlayerSockets, socketIdToGamePlayerId);
          return;
        }
        clearAutoAdvanceTimeout(payload.gameId);
        clearRoundTimer(payload.gameId);
        if (result.type === "NO_WINNER") {
          emitPlayerGameStates(io, result.state, gamePlayerSockets);
          scheduleBotActions(payload.gameId, io, gamePlayerSockets, socketIdToGamePlayerId);
          setTimedRoundTimer(payload.gameId, io, scheduleBotActions, gamePlayerSockets, socketIdToGamePlayerId);
          return;
        }
        emitPlayerGameStates(io, result.state, gamePlayerSockets);
        scheduleAutoAdvance(payload.gameId, io, gamePlayerSockets, socketIdToGamePlayerId, scheduleBotActions);
      }
    } catch (err) {
      logger.error("game:vote error", err);
      emitSocketError(socket, "game:error", "vote", err);
    }
  });

  // Handle socket disconnection — clean up game player socket mapping
  socket.on("disconnect", () => {
    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return;

    const userId: string | undefined = socket.data.userId;
    if (!userId) return;

    const gamePlayerId = socketIdToGamePlayerId.get(socket.id);
    if (!gamePlayerId) return;

    socketIdToGamePlayerId.delete(socket.id);

    const sockets = gamePlayerSockets.get(gamePlayerId);
    if (!sockets) return;

    sockets.delete(socket.id);

    if (sockets.size === 0) {
      gamePlayerSockets.delete(gamePlayerId);
      let username = userId;
      try {
        const state = getGameState(gameId);
        const player = state.players.get(gamePlayerId);
        if (player) username = player.username;
      } catch {
        /* state may be gone */
      }
      const graceMs = midGameDisconnectGraceMs;
      io.to(`game:${gameId}`).emit("game:playerDisconnected", {
        gamePlayerId,
        userId,
        username,
        graceMs,
      });
    }
  });
};
