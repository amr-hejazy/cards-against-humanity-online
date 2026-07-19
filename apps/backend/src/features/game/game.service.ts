import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, Tx } from "../../db/client";
import {
  lobbies,
  games,
  gamePlayers,
  cards,
  lobbyPlayers,
  cardPacks,
  cardPackCards,
} from "../../db/schema";
import { getVoteTally, clearVoteRecords } from "../../core/game/vote-maps";
import { shuffle } from "../../utils/shuffle";
import {
  createGameState,
  getGameState,
  deleteGameState,
  withGameLock,
  requireGameLock,
  removeGamePlayerMappings,
} from "./game.state";
import type { Card, EndGameResults, GameMode } from "@cah/shared";
import {
  GamePlayerState,
  GameState,
  GameModeState,
  JudgeSubmissionResult,
  WinnerRevealState,
} from "./game.types";
import type { BotPlayer } from "../../core/game/lobby-bot.state";
import {
  MIN_PLAYERS,
  STARTING_HAND_SIZE,
  DEFAULT_WINNING_SCORE,
  DEFAULT_MAX_ROUNDS,
  DEFAULT_GAME_MODE,
  DEFAULT_ROUND_TIMEOUT_SECONDS,
} from "@cah/shared";
import { AppError, ErrorTypes } from "../../core/error/errors";
import { getStrategy } from "./game-modes";

/**
 * Starts a game in the specified lobby if the requesting user is the host and all conditions are met.
 * @param roomCode
 * @param hostUserId
 * @returns The game state after the game has started.
 */
export const startGame = async (
  roomCode: string,
  hostUserId: string,
  gameMode?: GameMode,
  extraPlayers?: BotPlayer[],
) => {
  // Wrapped in a transaction to ensure atomicity of game start
  const { game, state } = await db.transaction(async (tx) => {
    // 1. Find the lobby
    const lobby = await tx.query.lobbies.findFirst({
      where: eq(lobbies.roomCode, roomCode),
      with: {
        players: true,
      },
    });

    if (!lobby) {
      throw new AppError(
        404,
        `Lobby with room code ${roomCode} not found`,
        ErrorTypes.LOBBY_NOT_FOUND,
      );
    }

    const winningScore = lobby.winningScore ?? DEFAULT_WINNING_SCORE;
    const maxRounds = lobby.maxRounds ?? DEFAULT_MAX_ROUNDS;
    gameMode = (gameMode ?? lobby.gameMode ?? DEFAULT_GAME_MODE) as GameMode;
    const selectedPackIds: number[] | null = lobby.selectedPackIds;
    const houseRules: string[] = lobby.houseRules ?? [];

    // 2. Verify the user is the host
    if (lobby.hostId !== hostUserId) {
      throw new AppError(
        403,
        "Only the host can start the game",
        ErrorTypes.NOT_HOST,
      );
    }

    // 3. Verify there are enough players to start the game (counts both human and bot players)
    const totalPlayerCount = lobby.players.length + (extraPlayers?.length ?? 0);
    if (totalPlayerCount < MIN_PLAYERS) {
      throw new AppError(
        400,
        `At least ${MIN_PLAYERS} players are required to start the game`,
        ErrorTypes.NOT_ENOUGH_PLAYERS,
      );
    }

    // 4. Verify all human players are ready
    if (!lobby.players.every((player) => player.isReady)) {
      throw new AppError(
        400,
        "All players must be ready to start the game",
        ErrorTypes.PLAYERS_NOT_READY,
      );
    }

    // 5. Atomically transition lobby from WAITING to IN_PROGRESS
    // This prevents TOCTOU: only one concurrent startGame can succeed
    const result = await tx
      .update(lobbies)
      .set({ status: "IN_PROGRESS" })
      .where(and(eq(lobbies.id, lobby.id), eq(lobbies.status, "WAITING")))
      .returning({ id: lobbies.id });

    if (result.length === 0) {
      throw new AppError(
        400,
        "Game has already started or finished",
        ErrorTypes.GAME_ALREADY_STARTED,
      );
    }

    // 6. Create a new game entry in the games table
    const [game] = await tx
      .insert(games)
      .values({
        lobbyId: lobby.id,
      })
      .returning();

    // 7. Shuffle the players to randomize the order
    const shuffled = shuffle(lobby.players);
    // 8. Insert all players into the gamePlayers table
    const gamePlayersData = shuffled.map((player, index) => ({
      gameId: game.id,
      userId: player.userId,
      playerOrder: index + 1, // Assuming player order starts from 1
    }));

    await tx.insert(gamePlayers).values(gamePlayersData);

    // 9. Initialize the game state (dealing cards, setting up decks, etc.)
    const state = await createInitialGameState(
      tx,
      game.id,
      extraPlayers,
      winningScore,
      maxRounds,
      gameMode,
      selectedPackIds,
      lobby.houseRules ?? [],
      lobby.roundTimeoutSeconds ?? DEFAULT_ROUND_TIMEOUT_SECONDS,
      lobby.modeConfig ?? {},
    );
    state.roomCode = lobby.roomCode;

    // 10. Return the game state
    return {
      game,
      state,
    };
  });

  // Create in-memory state only after transaction committed.
  // Avoid orphan GameState if tx rolls back.
  createGameState(state);

  return { game, state };
};
/**
 * Initializes the game state by dealing cards and setting up decks.
 * @param tx A database transaction object
 * @param gameId The ID of the game to initialize
 * @returns The initialized game state
 */
const createInitialGameState = async (
  tx: Tx,
  gameId: string,
  extraPlayers?: BotPlayer[],
  winningScore?: number,
  maxRounds?: number,
  gameMode?: GameMode,
  selectedPackIds?: number[] | null,
  houseRules?: string[],
  roundTimeoutSeconds?: number,
  modeConfig?: Record<string, unknown>,
) => {
  // 1. Load the game and its players
  const game = await tx.query.games.findFirst({
    where: eq(games.id, gameId),
    with: {
      players: {
        with: {
          user: true,
        },
      },
    },
  });

  if (!game) {
    throw new AppError(404, "Game not found", ErrorTypes.GAME_NOT_FOUND);
  }

  if (game.players.length === 0) {
    throw new AppError(
      400,
      "Game has no players",
      ErrorTypes.NOT_ENOUGH_PLAYERS,
    );
  }

  const gamePlayerOrder = [...game.players]
    .sort((a, b) => a.playerOrder - b.playerOrder)
    .map((player) => player.id);

  // 2. Determine which packs to use
  let packIds: number[];
  if (selectedPackIds) {
    packIds = selectedPackIds;
  } else {
    const officialPacks = await tx
      .select({ id: cardPacks.id })
      .from(cardPacks)
      .where(eq(cardPacks.official, true));
    packIds = officialPacks.map((p) => p.id);
  }

  if (packIds.length === 0) {
    throw new AppError(
      400,
      "No packs available to draw cards from",
      ErrorTypes.NO_CARDS_AVAILABLE,
    );
  }

  const effectiveMode = (gameMode ?? DEFAULT_GAME_MODE) as GameMode;
  const effectiveModeConfig = modeConfig ?? {};
  const strategy = getStrategy(effectiveMode);

  // 3. Load cards filtered by allowed packs
  let whiteCards: Card[] = [];
  if (strategy.shouldLoadWhiteCards()) {
    const loadedWhite = await tx
      .selectDistinct({
        id: cards.id,
        type: cards.type,
        text: cards.text,
        pick: cards.pick,
      })
      .from(cards)
      .innerJoin(cardPackCards, eq(cards.id, cardPackCards.cardId))
      .where(
        and(eq(cards.type, "WHITE"), inArray(cardPackCards.packId, packIds)),
      );

    if (loadedWhite.length === 0) {
      throw new AppError(
        400,
        "No white cards available",
        ErrorTypes.NO_CARDS_AVAILABLE,
      );
    }
    whiteCards = loadedWhite as Card[];
  }

  const blackCards = await tx
    .selectDistinct({
      id: cards.id,
      type: cards.type,
      text: cards.text,
      pick: cards.pick,
    })
    .from(cards)
    .innerJoin(cardPackCards, eq(cards.id, cardPackCards.cardId))
    .where(
      and(eq(cards.type, "BLACK"), inArray(cardPackCards.packId, packIds)),
    );

  if (blackCards.length === 0) {
    throw new AppError(
      400,
      "No black cards available, add more packs!",
      ErrorTypes.NO_CARDS_AVAILABLE,
    );
  }

  if (strategy.shouldLoadWhiteCards()) {
    const humanCount = game.players.length;
    const botCount = extraPlayers?.length ?? 0;
    const totalPlayers = humanCount + botCount;
    const cardsNeeded = totalPlayers * STARTING_HAND_SIZE;

    if (whiteCards.length < cardsNeeded) {
      throw new AppError(
        400,
        "Not enough white cards to deal starting hands, add more packs!",
        ErrorTypes.NOT_ENOUGH_CARDS,
      );
    }
  }

  // 3. Shuffle decks
  const shuffledWhiteCards = strategy.shouldLoadWhiteCards() ? shuffle(whiteCards) : [];
  const shuffledBlackCards = shuffle(blackCards);

  // 4. Deal hands
  const players = new Map<string, GamePlayerState>();

  for (const player of game.players) {
    let hand: Card[] = [];
    if (strategy.shouldLoadWhiteCards()) {
      hand = [];
      for (let i = 0; i < STARTING_HAND_SIZE; i++) {
        hand.push(shuffledWhiteCards.pop()!);
      }
    }
    players.set(player.id, {
      gamePlayerId: player.id,
      userId: player.userId,
      username: player.user.username,
      playerOrder: player.playerOrder,
      score: player.score,
      hand,
    });
  }

  // 4a. Add bot players (in-memory only)
  const humanCount = game.players.length;
  if (extraPlayers && strategy.shouldLoadWhiteCards()) {
    for (let i = 0; i < extraPlayers.length; i++) {
      const bot = extraPlayers[i];
      const gpId = randomUUID();
      const hand: Card[] = [];
      for (let j = 0; j < STARTING_HAND_SIZE; j++) {
        hand.push(shuffledWhiteCards.pop()!);
      }
      players.set(gpId, {
        gamePlayerId: gpId,
        userId: bot.userId,
        username: bot.username,
        playerOrder: humanCount + i + 1,
        score: 0,
        hand,
        isBot: true,
      });
      gamePlayerOrder.push(gpId);
    }
  }

  // 5. Remaining deck
  const whiteDeck = shuffledWhiteCards;

  const firstBlackCard = shuffledBlackCards[0];
  if (!firstBlackCard) {
    throw new AppError(
      400,
      "Failed to draw first black card",
      ErrorTypes.NO_CARDS_AVAILABLE,
    );
  }

  const blackDeck = shuffledBlackCards.slice(1);

  // 6. Determine first judge
  const firstJudgeId = gamePlayerOrder[0];

  if (!firstJudgeId) {
    throw new AppError(
      400,
      "Failed to determine first judge",
      ErrorTypes.JUDGE_NOT_FOUND,
    );
  }

  // 7. Build in-memory game state
  const modeState: GameModeState = effectiveMode === "blank_only"
    ? { modeName: "blank_only", votingStyle: (effectiveModeConfig.votingStyle as "czar_votes" | "all_votes") ?? "czar_votes" }
    : { modeName: effectiveMode } as GameModeState;

  const state: GameState = {
    gameId: game.id,
    lobbyId: game.lobbyId,
    roomCode: "",
    whiteDeck,
    blackDeck,
    discardPile: [],
    players,
    gamePlayerOrder,
    currentRound: {
      id: randomUUID(),
      number: 1,
      judgeGamePlayerId: firstJudgeId,
      blackCard: firstBlackCard,
      submissions: {},
      status: "PLAYING",
      roundStartedAt: houseRules?.includes("timed_rounds") ? new Date() : undefined,
    },
    winnerReveal: null,
    winningScore: winningScore ?? DEFAULT_WINNING_SCORE,
    maxRounds: maxRounds ?? DEFAULT_MAX_ROUNDS,
    gameMode: effectiveMode,
    selectedPackIds: selectedPackIds ?? null,
    blankCardsEnabled: houseRules?.includes("blank_cards") ?? false,
    timedRoundsEnabled: houseRules?.includes("timed_rounds") ?? false,
    nextWinnerCzarEnabled: houseRules?.includes("next_winner_czar") ?? false,
    roundTimeoutSeconds: roundTimeoutSeconds ?? DEFAULT_ROUND_TIMEOUT_SECONDS,
    nextBlankId: -1,
    modeState,
    modeConfig: effectiveModeConfig,
  };

  // 8a. Notify strategy that round has started
  if (state.currentRound) {
    strategy.onRoundStart(state, state.currentRound);
  }

  // 8b. For judge-less modes, clear the judge ID so no player
  //     is treated as czar by the frontend's PlayingPhase.
  if (strategy.getJudgePlayerId(state) === null) {
    state.currentRound!.judgeGamePlayerId = "";
  }

  // 9. Return the initialized game state
  return state;
};

/**
 * Submits cards for a player in the current round of a game. Validates the submission and updates the game state accordingly.
 * @param gameId
 * @param gamePlayerId
 * @param submittedCardIds
 * @returns The updated game state after the submission
 */
export const submitCards = async (
  gameId: string,
  gamePlayerId: string,
  submittedCardIds: number[],
  customTexts?: Record<string, string>,
) => {
  return withGameLock(gameId, async () => {
    // 1. Validate submission via strategy (round status, player ownership, card counts, etc.)
    const state = getGameState(gameId);
    const strategy = getStrategy(state.gameMode);
    const currentRound = state.currentRound!;

    strategy.validateSubmit(state, gamePlayerId, submittedCardIds, customTexts);

    // 2. Capture submitted card objects before removing from hand
    const player = state.players.get(gamePlayerId)!;
    const cardMap = new Map(player.hand.map((c) => [c.id, c]));
    const submittedCards = submittedCardIds
      .map((id) => cardMap.get(id))
      .filter((c): c is Card => c !== undefined);

    // 3. Apply custom text to blank cards
    for (const card of submittedCards) {
      if (card.isBlank && customTexts?.[card.id.toString()]) {
        card.customText = customTexts[card.id.toString()];
      }
    }

    // 4. Remove submitted cards from hand
    player.hand = player.hand.filter(
      (card) => !submittedCardIds.includes(card.id),
    );

    // 5. Record the submission
    currentRound.submissions[gamePlayerId] = {
      gamePlayerId,
      cards: submittedCards,
      submittedAt: new Date(),
    };

    // 6. Transition to REVEAL once expected number of submissions is met
    const totalSubmissions = Object.keys(currentRound.submissions).length;
    if (totalSubmissions >= strategy.getExpectedSubmissionCount(state)) {
      startRevealPhase(state);
    }

    return state;
  });
};

/**
 * Handles the judge's selection of a winning submission for the current round of a game. Validates the selection and updates the game state accordingly.
 * @param gameId
 * @param judgeGamePlayerId
 * @param chosenGamePlayerId
 * @returns The updated game state after the judge has selected a winning submission
 * @throws Error if the judge is not the current judge, if the round is not in REVEAL status, or if the chosen submission does not exist.
 */
export const judgeSubmission = async (
  gameId: string,
  judgeGamePlayerId: string,
  chosenGamePlayerId: string,
): Promise<JudgeSubmissionResult> => {
  return withGameLock(gameId, async () => {
    // 1. Validate round exists, judge is correct, round is in REVEAL, and submission exists
    const state = getGameState(gameId);
    if (!state.currentRound) {
      throw new AppError(400, "No active round", ErrorTypes.ROUND_NOT_PLAYING);
    }
    if (state.currentRound.judgeGamePlayerId !== judgeGamePlayerId) {
      throw new AppError(400, "Only the current judge can select a winning submission", ErrorTypes.NOT_JUDGE);
    }
    if (state.currentRound.status !== "REVEAL") {
      throw new AppError(400, "Cannot judge submissions when the round is not in REVEAL status", ErrorTypes.ROUND_NOT_REVEAL);
    }
    if (!state.currentRound.submissions[chosenGamePlayerId]) {
      throw new AppError(400, "Chosen submission does not exist", ErrorTypes.INVALID_SUBMISSION);
    }

    // 2. Resolve round via strategy (handles normal wins, no_winner, etc.)
    const strategy = getStrategy(state.gameMode);
    const prevJudgeGpId = state.currentRound.judgeGamePlayerId;
    const result = strategy.resolveRound(state, { winnerGpId: chosenGamePlayerId });

    // 3. Award points for normal wins
    if (result.type === "normal") {
      const chosenPlayer = state.players.get(chosenGamePlayerId);
      if (!chosenPlayer) {
        throw new AppError(404, "Chosen player not found in the game", ErrorTypes.PLAYER_NOT_FOUND);
      }
      chosenPlayer.score += result.pointsAwarded;
    }

    // 4. Build winner reveal (or handle no_winner for modes like Rando Cardrissian)
    const winnerReveal = strategy.buildWinnerReveal(state, result, prevJudgeGpId);
    if (!winnerReveal) {
      state.currentRound = null;
      state.winnerReveal = null;
      const nextState = await startNextRound(state);
      return { type: "NO_WINNER", state: nextState };
    }

    state.winnerReveal = winnerReveal;
    state.currentRound = null;
    return { type: "ROUND_WINNER", state, winnerReveal };
  });
};

export const resolveVoteRound = async (gameId: string): Promise<JudgeSubmissionResult> => {
  return withGameLock(gameId, async () => {
    const state = getGameState(gameId);
    const round = state.currentRound;
    if (!round || round.status !== "VOTING") {
      throw new AppError(400, "Round is not in VOTING status", ErrorTypes.ROUND_NOT_PLAYING);
    }

    const strategy = getStrategy(state.gameMode);
    const tally = getVoteTally(gameId, round.number);
    const prevJudgeGpId = round.judgeGamePlayerId;
    const result = strategy.resolveVoteRound(state, tally);

    if (result.type === "normal" && result.winnerGpId) {
      const winner = state.players.get(result.winnerGpId);
      if (winner) winner.score += result.pointsAwarded;
    }

    const winnerReveal = strategy.buildWinnerReveal(state, result, prevJudgeGpId);

    if (!winnerReveal) {
      clearVoteRecords(gameId);
      state.currentRound = null;
      state.winnerReveal = null;
      const nextState = await startNextRound(state);
      return { type: "NO_WINNER", state: nextState };
    }

    clearVoteRecords(gameId);

    const endCheck = strategy.checkGameEnd(state, result);
    if (endCheck.ended) {
      state.winnerReveal = winnerReveal;
      state.currentRound = null;
      // Return ROUND_WINNER so the handler emits winner reveal state and
      // sets up the auto-advance timer, which calls endGame + endGameCleanup
      // after the reveal delay. This gives the frontend time to show the
      // winner reveal before transitioning to game over.
      return { type: "ROUND_WINNER", state, winnerReveal };
    }

    state.winnerReveal = winnerReveal;
    state.currentRound = null;
    return { type: "ROUND_WINNER", state, winnerReveal };
  });
};

/**
 * Starts the next round of the game by rotating the judge, drawing a new black card, refilling players' hands, and creating a new round in the database.
 * @param state
 * @returns The updated game state after starting the next round
 */
export const startNextRound = async (state: GameState) => {
  // 1. Ensure the game is locked to prevent concurrent modifications
  requireGameLock(state.gameId);
  let previousJudgeGamePlayerId: string;
  let nextRoundNumber: number;

  // 2. Determine the previous judge and next round number based on the current state
  if (state.currentRound) {
    for (const sub of Object.values(state.currentRound.submissions)) {
      state.discardPile.push(...sub.cards.filter((c) => !c.isBlank));
    }
    previousJudgeGamePlayerId = state.currentRound.judgeGamePlayerId;
    nextRoundNumber = state.currentRound.number + 1;
  } else if (state.winnerReveal) {
    // If the current round is null, we can use the winnerReveal to determine the previous judge and next round number
    previousJudgeGamePlayerId = state.winnerReveal.previousJudgeGamePlayerId;
    nextRoundNumber = state.winnerReveal.nextRoundNumber;
  } else {
    throw new AppError(
      400,
      "Cannot start next round: no active round and no winner reveal",
      ErrorTypes.ROUND_NOT_PLAYING,
    );
  }

  // 3. Determine next judge via strategy
  const strategy = getStrategy(state.gameMode);
  const nextJudgeId = strategy.determineNextJudge(state, previousJudgeGamePlayerId);

  // 4. Draw the next black card from the deck, throwing an error if there are no more black cards available
  const nextBlackCard = state.blackDeck.pop();
  if (!nextBlackCard) {
    throw new AppError(
      400,
      "No more black cards available in the deck",
      ErrorTypes.NO_CARDS_AVAILABLE,
    );
  }

  // 5. Determine draw count from previous round's black card pick
  const drawCount = state.currentRound
    ? Math.max(0, state.currentRound.blackCard.pick ?? 0)
    : state.winnerReveal
    ? Math.max(0, state.winnerReveal.blackCard.pick ?? 0)
    : 0;

  // 6. Refill players' hands
  if (strategy.shouldLoadWhiteCards()) {
    for (const player of state.players.values()) {
      let toDraw = drawCount;
      // Floor: if below STARTING_HAND_SIZE, draw to fill to STARTING_HAND_SIZE first
      if (player.hand.length < STARTING_HAND_SIZE) {
        toDraw += STARTING_HAND_SIZE - player.hand.length;
      }
      // Draw cards from whiteDeck
      for (let i = 0; i < toDraw; i++) {
        let nextWhiteCard = state.whiteDeck.pop();
        if (!nextWhiteCard) {
          if (state.discardPile.length === 0) {
            throw new AppError(
              400,
              "No more white cards available in the deck",
              ErrorTypes.NO_CARDS_AVAILABLE,
            );
          }
          state.whiteDeck = shuffle(state.discardPile);
          state.discardPile = [];
          nextWhiteCard = state.whiteDeck.pop()!;
        }
        player.hand.push(nextWhiteCard);
      }

      // Blank card chance (1/4 per player per round, bots excluded)
      if (
        state.blankCardsEnabled &&
        !player.isBot &&
        !player.hand.some((c) => c.isBlank) &&
        Math.floor(Math.random() * 4) === 0
      ) {
        const blankId = state.nextBlankId--;
        player.hand.push({
          id: blankId,
          type: "WHITE",
          text: "",
          pick: null,
          isBlank: true,
        });
      }
    }
  }

  // 7. Create a new round and update the game state accordingly
  state.currentRound = {
    id: randomUUID(),
    number: nextRoundNumber,
    judgeGamePlayerId: nextJudgeId,
    blackCard: nextBlackCard,
    submissions: {},
    status: "PLAYING",
    roundStartedAt: state.timedRoundsEnabled ? new Date() : undefined,
  };

  state.winnerReveal = null;

  strategy.onRoundStart(state, state.currentRound);

  // For judge-less modes (czar-is-dead), clear the judge ID after onRoundStart
  // so NormalStrategy's getJudgePlayerId reads the freshly-set judgeGamePlayerId.
  if (strategy.getJudgePlayerId(state) === null) {
    state.currentRound.judgeGamePlayerId = "";
  }

  return state;
};

/**
 * Ends the game by marking it as finished in the database, updating the lobby status, removing the in-memory game state, and returning the final results.
 * @param state
 * @param winnerGamePlayerId
 * @returns The final results of the game after it has ended
 */
export const endGame = async (
  state: GameState,
  winnerGamePlayerId: string | null,
): Promise<EndGameResults> => {
  requireGameLock(state.gameId);
  const isTie = winnerGamePlayerId === null;

  let winnerUserId: string | null = null;
  if (!isTie) {
    const winnerPlayer = state.players.get(winnerGamePlayerId);
    if (!winnerPlayer) {
      throw new AppError(404, "Winner not found", ErrorTypes.PLAYER_NOT_FOUND);
    }
    winnerUserId = winnerPlayer.isBot ? null : winnerPlayer.userId;
  }

  // 1. Mark game as FINISHED in the database
  await db.transaction(async (tx) => {
    await tx
      .update(games)
      .set({
        status: "FINISHED",
        winnerId: winnerUserId,
        endedAt: new Date(),
      })
      .where(eq(games.id, state.gameId));

    // 2. Mark the lobby as waiting in the database
    await tx
      .update(lobbies)
      .set({ status: "WAITING" })
      .where(eq(lobbies.id, state.lobbyId));

    await tx
      .update(lobbyPlayers)
      .set({ isReady: false })
      .where(eq(lobbyPlayers.lobbyId, state.lobbyId));
  });

  // 3. Build final results before removing in-memory state
  const finalResults: EndGameResults = {
    lobbyId: state.lobbyId,
    roomCode: state.roomCode,
    winnerGamePlayerId,
    isTie,
    players: Array.from(state.players.values()).map((player) => ({
      gamePlayerId: player.gamePlayerId,
      userId: player.userId,
      username: player.username,
      score: player.score,
    })),
  };

  // 4. Clean up vote records for the ended game
  clearVoteRecords(state.gameId);

  // 5. Remove the in-memory game state
  deleteGameState(state.gameId);
  return finalResults;
};

/**
 * Transitions the current round of the game to the REVEAL phase by updating the round's status in both the in-memory state and the database.
 * @param state
 * @returns The updated state after changing current round's status
 */
export const startRevealPhase = (state: GameState) => {
  if (!state.currentRound) return state;
  state.currentRound.status = "REVEAL";
  const strategy = getStrategy(state.gameMode);
  strategy.onBeforeReveal(state, state.currentRound);
  return state;
};

/**
 * Resets games and lobbies left in "IN_PROGRESS" from a previous server instance.
 * In-memory GameState was lost on restart, so DB state must be cleaned up.
 */
export const resetStuckGames = async (): Promise<{
  gameCount: number;
  lobbyCount: number;
}> => {
  return await db.transaction(async (tx) => {
    const stuck = await tx
      .update(games)
      .set({ status: "FINISHED", endedAt: new Date() })
      .where(eq(games.status, "IN_PROGRESS"))
      .returning({ id: games.id, lobbyId: games.lobbyId });

    if (stuck.length === 0) return { gameCount: 0, lobbyCount: 0 };

    const lobbyIds = [...new Set(stuck.map((g) => g.lobbyId))];
    await tx
      .update(lobbies)
      .set({ status: "WAITING" })
      .where(eq(lobbies.status, "IN_PROGRESS"));

    return { gameCount: stuck.length, lobbyCount: lobbyIds.length };
  });
};

export const removePlayerFromGame = async (
  state: GameState,
  gamePlayerId: string,
) => {
  const player = state.players.get(gamePlayerId);
  if (!player) return;

  removeGamePlayerMappings(player.userId);

  state.discardPile.push(...player.hand.filter((c) => !c.isBlank));

  const orderIndex = state.gamePlayerOrder.indexOf(gamePlayerId);
  const wasJudge = state.currentRound?.judgeGamePlayerId === gamePlayerId;

  state.players.delete(gamePlayerId);
  if (orderIndex !== -1) {
    state.gamePlayerOrder.splice(orderIndex, 1);
  }

  if (state.currentRound) {
    delete state.currentRound.submissions[gamePlayerId];

    if (wasJudge) {
      const nextJudgeIndex =
        orderIndex >= state.gamePlayerOrder.length ? 0 : orderIndex;
      state.currentRound.judgeGamePlayerId =
        state.gamePlayerOrder[nextJudgeIndex];

      if (state.currentRound.status === "PLAYING") {
        delete state.currentRound.submissions[
          state.currentRound.judgeGamePlayerId
        ];
      }
    }

    if (state.currentRound.status === "PLAYING") {
      const totalSubmissions = Object.keys(
        state.currentRound.submissions,
      ).length;
      const strategy = getStrategy(state.gameMode);
      if (totalSubmissions >= strategy.getExpectedSubmissionCount(state)) {
        startRevealPhase(state);
      }
    }
  }
};
