import { db } from "./index";

type Db = typeof db;
/** A transaction callback's `tx` — for work that must run inside one. */
export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** `db` or a transaction callback's `tx` — both expose the same query API. */
export type DbExecutor = Db | DbTransaction;
