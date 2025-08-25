import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";

export function authRoutes(db) {
  const router = Router();

  // POST /api/v1/auth/register (for local testing)
  router.post(
    "/register",
    body("username").isString().trim().isLength({ min: 3 }),
    body("password").isString().isLength({ min: 6 }),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { username, password } = req.body;
      const hash = await bcrypt.hash(password, 12);

      try {
        await db.run(
          `INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'user')`,
          [username, hash]
        );
        return res.status(201).json({ message: "User created" });
      } catch (e) {
        if (String(e).includes("UNIQUE")) {
          return res.status(409).json({ error: "Username already exists" });
        }
        console.error(e);
        return res.status(500).json({ error: "Internal error" });
      }
    }
  );

  // POST /api/v1/auth/login
  router.post(
    "/login",
    body("username").isString().trim(),
    body("password").isString(),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { username, password } = req.body;
      const user = await db.get(`SELECT id, username, password_hash, role FROM users WHERE username = ?`, [username]);
      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES || "1h" }
      );

      return res.json({ token });
    }
  );

  return router;
}
