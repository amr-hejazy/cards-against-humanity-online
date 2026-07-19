const voteRecords = new Map<string, Map<string, string>>();

function key(gameId: string, roundNumber: number): string {
  return `${gameId}:${roundNumber}`;
}

export function setVote(gameId: string, roundNumber: number, voterGpId: string, chosenGpId: string): void {
  const k = key(gameId, roundNumber);
  let roundVotes = voteRecords.get(k);
  if (!roundVotes) {
    roundVotes = new Map();
    voteRecords.set(k, roundVotes);
  }
  roundVotes.set(voterGpId, chosenGpId);
}

export function getVoteTally(gameId: string, roundNumber: number): Record<string, number> {
  const roundVotes = voteRecords.get(key(gameId, roundNumber));
  if (!roundVotes) return {};
  const tally: Record<string, number> = {};
  for (const chosen of roundVotes.values()) {
    tally[chosen] = (tally[chosen] ?? 0) + 1;
  }
  return tally;
}

export function getVoteRecords(gameId: string, roundNumber: number): Map<string, string> | undefined {
  return voteRecords.get(key(gameId, roundNumber));
}

export function getVoteCount(gameId: string, roundNumber: number): { submitted: number } {
  const roundVotes = voteRecords.get(key(gameId, roundNumber));
  return { submitted: roundVotes?.size ?? 0 };
}

export function getVoterSet(gameId: string, roundNumber: number): Set<string> {
  const roundVotes = voteRecords.get(key(gameId, roundNumber));
  return new Set(roundVotes?.keys() ?? []);
}

export function clearVoteRecords(gameId: string): void {
  for (const k of voteRecords.keys()) {
    if (k.startsWith(`${gameId}:`)) {
      voteRecords.delete(k);
    }
  }
}

export function clearAllVoteRecords(): void {
  voteRecords.clear();
}
