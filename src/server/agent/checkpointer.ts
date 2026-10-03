import "server-only";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type BetterSqlite3 from "better-sqlite3";

// Checkpoints share the app's SQLite connection: one file, one writer.
export function createCheckpointer(sqlite: BetterSqlite3.Database): SqliteSaver {
  return new SqliteSaver(sqlite);
}
