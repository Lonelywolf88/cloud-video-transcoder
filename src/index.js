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
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: CORS_ORIGIN === "*" ? undefined : CORS_ORIGIN }));
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 8000;
const HOST = process.env.HOST || "0.0.0.0"; // bind to all interfaces for Docker/EC2

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

  const server = app.listen(PORT, HOST, () => {
    console.log(`Auth API listening on http://${HOST}:${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (sig) => {
    try {
      console.log(`\nReceived ${sig}, shutting down...`);
      server.close(() => process.exit(0));
      // Optionally close DB if needed: await db.close();
      setTimeout(() => process.exit(0), 3000);
    } catch {
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

bootstrap().catch((e) => {
  console.error("Failed to start server", e);
  process.exit(1);
});


// docker run -d --name videotranscoder \
//   -p 80:8000 \
//   -v /srv/videotranscoder/data:/data \
//   --env-file /srv/videotranscoder/.env \
//   901444280953.dkr.ecr.ap-southeast-2.amazonaws.com/12138657-assignment1:v6