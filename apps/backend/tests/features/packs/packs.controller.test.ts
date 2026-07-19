import { describe, it, expect } from "vitest";
import { db } from "../../../src/db/client";
import { cardPacks } from "../../../src/db/schema";
import { asc } from "drizzle-orm";

describe("GET /packs data", () => {
  it("returns all packs sorted by name", async () => {
    const packs = await db.query.cardPacks.findMany({
      columns: { id: true, name: true, official: true },
      orderBy: [asc(cardPacks.name)],
    });
    expect(Array.isArray(packs)).toBe(true);
    expect(packs.length).toBeGreaterThan(0);
    expect(packs[0].id).toBeDefined();
    expect(packs[0].name).toBeDefined();
    expect(packs[0].official).toBeDefined();
    for (let i = 1; i < packs.length; i++) {
      expect(packs[i].name.localeCompare(packs[i - 1].name)).toBeGreaterThanOrEqual(0);
    }
  });
});
