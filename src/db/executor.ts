import { db } from "./index";

type Db = typeof db;
/** `db` or a transaction callback's `tx` — both expose the same query API. */
export type DbExecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
