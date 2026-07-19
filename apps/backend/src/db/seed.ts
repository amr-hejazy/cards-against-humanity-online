import { readFile } from "fs/promises";
import { db } from "./client";
import { cards, cardPacks, cardPackCards } from "./schema";

const BATCH_SIZE = 1000;

type CompactJson = {
  white: string[];
  black: {
    text: string;
    pick: number;
  }[];
  metadata: Record<
    string,
    {
      id: number;
      name: string;
      official: boolean;
      white: number[];
      black: number[];
    }
  >;
};

async function batchInsert<T extends Record<string, any>>(
  tx: any,
  table: any,
  rows: T[],
) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    await tx.insert(table).values(chunk).onConflictDoNothing();
  }
}

async function seed() {
  const raw = await readFile(
    "src/assets/cah-cards-compact.json",
    "utf8",
  );

  const data = JSON.parse(raw) as CompactJson;

  const normalizeText = (text: string) => text.replace(/\\n/g, "\n");

  await db.transaction(async (tx) => {
    console.log("Seeding cards...");

    const whiteCards = data.white.map((text, index) => ({
      id: index,
      type: "WHITE" as const,
      text: normalizeText(text),
    }));
    await batchInsert(tx, cards, whiteCards);

    const blackCards = data.black.map((card, index) => ({
      id: data.white.length + index,
      type: "BLACK" as const,
      text: normalizeText(card.text),
      pick: card.pick,
    }));
    await batchInsert(tx, cards, blackCards);

    console.log("Seeding packs...");

    const packRows = Object.values(data.metadata).map((pack) => ({
      id: pack.id,
      name: pack.name,
      official: pack.official,
    }));
    await batchInsert(tx, cardPacks, packRows);

    console.log("Creating pack relationships...");

    const relationships: (typeof cardPackCards.$inferInsert)[] = [];
    for (const pack of Object.values(data.metadata)) {
      for (const cardId of pack.white) {
        relationships.push({
          packId: pack.id,
          cardId,
        });
      }
      for (const cardId of pack.black) {
        relationships.push({
          packId: pack.id,
          cardId: data.white.length + cardId,
        });
      }
    }
    await batchInsert(tx, cardPackCards, relationships);

    console.log(`
✅ Seed complete!
--------------------------
White cards : ${data.white.length}
Black cards : ${data.black.length}
Packs       : ${Object.keys(data.metadata).length}
Relations   : ${relationships.length}
`);
  });
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:");
    console.error(err);
    process.exit(1);
  });
