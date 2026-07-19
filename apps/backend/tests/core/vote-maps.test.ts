import { describe, it, expect, beforeEach } from "vitest";
import {
  setVote,
  getVoteTally,
  getVoteCount,
  getVoterSet,
  clearVoteRecords,
  clearAllVoteRecords,
} from "../../src/core/game/vote-maps";

describe("vote-maps", () => {
  beforeEach(() => {
    clearAllVoteRecords();
  });

  it("records a vote and returns tally", () => {
    setVote("game1", 1, "voter1", "subA");
    const tally = getVoteTally("game1", 1);
    expect(tally).toEqual({ subA: 1 });
  });

  it("tally counts multiple votes for same target", () => {
    setVote("game1", 1, "voter1", "subA");
    setVote("game1", 1, "voter2", "subA");
    expect(getVoteTally("game1", 1)).toEqual({ subA: 2 });
  });

  it("tally splits votes for different targets", () => {
    setVote("game1", 1, "voter1", "subA");
    setVote("game1", 1, "voter2", "subB");
    setVote("game1", 1, "voter3", "subA");
    expect(getVoteTally("game1", 1)).toEqual({ subA: 2, subB: 1 });
  });

  it("overwrites previous vote from same voter", () => {
    setVote("game1", 1, "voter1", "subA");
    setVote("game1", 1, "voter1", "subB");
    expect(getVoteTally("game1", 1)).toEqual({ subB: 1 });
  });

  it("isolates votes by round number", () => {
    setVote("game1", 1, "voter1", "subA");
    setVote("game1", 2, "voter1", "subB");
    expect(getVoteTally("game1", 1)).toEqual({ subA: 1 });
    expect(getVoteTally("game1", 2)).toEqual({ subB: 1 });
  });

  it("isolates votes by game id", () => {
    setVote("game1", 1, "voter1", "subA");
    setVote("game2", 1, "voter1", "subB");
    expect(getVoteTally("game1", 1)).toEqual({ subA: 1 });
    expect(getVoteTally("game2", 1)).toEqual({ subB: 1 });
  });

  it("getVoteCount returns submitted count", () => {
    expect(getVoteCount("game1", 1)).toEqual({ submitted: 0 });
    setVote("game1", 1, "voter1", "subA");
    expect(getVoteCount("game1", 1)).toEqual({ submitted: 1 });
    setVote("game1", 1, "voter2", "subB");
    expect(getVoteCount("game1", 1)).toEqual({ submitted: 2 });
  });

  it("getVoterSet returns voters", () => {
    setVote("game1", 1, "voter1", "subA");
    setVote("game1", 1, "voter2", "subB");
    const voters = getVoterSet("game1", 1);
    expect(voters.has("voter1")).toBe(true);
    expect(voters.has("voter2")).toBe(true);
    expect(voters.has("voter3")).toBe(false);
  });

  it("clearVoteRecords clears votes for specific game", () => {
    setVote("game1", 1, "voter1", "subA");
    setVote("game1", 2, "voter2", "subB");
    setVote("game2", 1, "voter3", "subC");
    clearVoteRecords("game1");
    expect(getVoteTally("game1", 1)).toEqual({});
    expect(getVoteTally("game1", 2)).toEqual({});
    expect(getVoteTally("game2", 1)).toEqual({ subC: 1 });
  });

  it("clearAllVoteRecords clears everything", () => {
    setVote("game1", 1, "voter1", "subA");
    setVote("game2", 1, "voter2", "subB");
    clearAllVoteRecords();
    expect(getVoteTally("game1", 1)).toEqual({});
    expect(getVoteTally("game2", 1)).toEqual({});
  });
});
