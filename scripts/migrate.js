import sqlite3 from "sqlite3";
import { open } from "sqlite";

async function migrate() {
  const dbFile = process.env.DB_FILE;
  const db = await open({
    filename: dbFile,
    driver: sqlite3.Database,
  });

  // Ensure users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure videos table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      title TEXT,
      filename TEXT NOT NULL,
      status TEXT NOT NULL,
      duration REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );
  `);

  // Ensure renditions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS renditions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      quality TEXT NOT NULL,
      filename TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (video_id) REFERENCES videos(id)
    );
  `);

  // Ensure video_tags table (new)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS video_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      score REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );
  `);

  // Optional: useful indexes
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_video_tags_video_id ON video_tags(video_id);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_video_tags_tag ON video_tags(tag);`);

  console.log("✅ Migration complete. All tables ensured.");
  await db.close();
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
