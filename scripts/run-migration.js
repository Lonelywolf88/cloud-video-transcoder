// src/lib/db.js (or wherever you open SQLite)
import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

export const DB_PATH =
  process.env.DB_PATH || path.resolve(process.cwd(), "data/app.db");

export async function createDb() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  console.log("[db] using", DB_PATH);
  const list = await db.all("PRAGMA database_list;");
  console.log("[db] database_list:", list);
  return db;
}
