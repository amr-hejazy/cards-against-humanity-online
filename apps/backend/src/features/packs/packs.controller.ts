import { Router } from "express";
import { db } from "../../db/client";
import { cardPacks } from "../../db/schema";
import { asc } from "drizzle-orm";
import { getOrSetCache } from "../../core/redis/client";

const router = Router();

const fetchPacks = async () => {
  return db.query.cardPacks.findMany({
    columns: { id: true, name: true, official: true },
    orderBy: [asc(cardPacks.name)],
  });
};

router.get("/", async (_req, res) => {
  // Cache-aside: try Redis first, fall back to DB query
  const packs = await getOrSetCache("packs:all", fetchPacks, 300);
  res.json({ packs });
});

export default router;
