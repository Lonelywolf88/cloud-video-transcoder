import fs from "node:fs";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { fileURLToPath } from "url";

// Open (and initialize) the SQLite database file.
export async function getDb(dbFilePath) {
  const filename = path.resolve(dbFilePath);
  // Ensure the parent directory exists (e.g., ./data)
  fs.mkdirSync(path.dirname(filename), { recursive: true });

  const db = await open({ filename, driver: sqlite3.Database });

  // Enable FK constraints and ensure base tables exist
  await db.exec(`
    PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 10000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Run videos migration
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const mig = fs.readFileSync(path.join(__dirname, "migrations_02_videos.sql"), "utf8");
  await db.exec(mig);

  return db;
}
