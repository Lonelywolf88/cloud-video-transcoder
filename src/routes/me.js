import { Router } from "express";
import { authRequired } from "../middleware/auth.js";

export function meRoutes() {
  const router = Router();

  // GET /api/v1/me (protected)
  router.get("/me", authRequired, (req, res) => {
    // req.user is from JWT
    res.json({ user: req.user });
  });

  return router;
}
