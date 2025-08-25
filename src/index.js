import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { getDb } from "./db/sqlite.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { videoRoutes } from "./routes/videos.js";
import { startTranscodeWorker } from "./worker/transcodeWorker.js";
import { mediaRoutes } from "./routes/media.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 8000;

const bootstrap = async () => {
  const db = await getDb(process.env.DB_FILE || "./data/app.db");

  // Ensure temp dir exists
  fs.mkdirSync(path.join(process.cwd(), "data", "tmp"), { recursive: true });

  app.get("/api/v1/health", (_req, res) => res.json({ ok: true }));

  // Serve static UI from /public
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  app.use("/", express.static(path.join(__dirname, "..", "public")));
  // Pretty path for login page
  app.get("/login", (_req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "login.html"));
  });

  app.use("/api/v1/auth", authRoutes(db));
  app.use("/api/v1", meRoutes());
  app.use("/api/v1", videoRoutes(db));
  app.use("/api/v1", mediaRoutes(db));

  // start background worker
  startTranscodeWorker(db);

  app.listen(PORT, () => {
    console.log(`Auth API listening on http://localhost:${PORT}`);
  });
};

bootstrap().catch((e) => {
  console.error("Failed to start server", e);
  process.exit(1);
});
