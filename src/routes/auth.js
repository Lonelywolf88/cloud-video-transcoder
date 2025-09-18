import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";

const DEFAULT_USERNAME = process.env.DEMO_USERNAME || "yiteng";
const DEFAULT_PASSWORD = process.env.DEMO_PASSWORD || "yiteng";

const demoUser = {
  id: process.env.DEMO_USER_ID || "demo-user",
  username: DEFAULT_USERNAME,
  password: DEFAULT_PASSWORD,
  role: process.env.DEMO_USER_ROLE || "user"
};

async function verifyPassword(plain, expected) {
  if (!expected) return false;

  if (expected.startsWith("$2")) {
    try {
      return await bcrypt.compare(plain, expected);
    } catch {
      return false;
    }
  }

  return plain === expected;
}

export function authRoutes() {
  const router = Router();

  router.post("/register", (_req, res) => {
    return res.status(503).json({
      error: "Registration is temporarily disabled for this deployment."
    });
  });

  router.post(
    "/login",
    body("username").isString().trim(),
    body("password").isString(),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const username = req.body.username.trim();
      const password = req.body.password;

      if (username !== demoUser.username) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const ok = await verifyPassword(password, demoUser.password);
      if (!ok) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign(
        { id: demoUser.id, username: demoUser.username, role: demoUser.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES || "1h" }
      );

      return res.json({ token });
    }
  );

  return router;
}
