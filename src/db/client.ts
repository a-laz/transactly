import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

const dbPath = process.env.DB_PATH || "./data/app.db";

export const sqlite = new Database(dbPath);
// Ensure FK constraints are enforced
try { sqlite.pragma('foreign_keys = ON'); } catch {}
export const db = drizzle(sqlite);


