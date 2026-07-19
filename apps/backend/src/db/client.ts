import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../env";
import * as schema from "./schema";
import * as relations from "./relations";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(pool, {
  schema: {
    ...schema,
    ...relations,
  },
});

export type Db = typeof db; // Export the type of the database instance for use in other parts of the application
/*
tx is not the same type as db, but it's very similar. It's a special object that executes every query within the same SQL transaction.
Db["transaction"] : gets the type of the transaction method
Parameters<...> [0] : gets the first parameter of that method, which is a function that takes a transaction object as an argument (async (tx) => { ... })
infer T : infers the type of the tx parameter from that function

Effectively means : "Give me the type of whatever tx is inside db.transaction()"
*/
export type Tx = Parameters<Db["transaction"]>[0] extends (
  tx: infer T,
) => Promise<any>
  ? T
  : never;
