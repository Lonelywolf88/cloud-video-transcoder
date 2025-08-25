import jwt from "jsonwebtoken";

export function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  // Fallback for media elements and downloads where custom headers aren't sent
  if (!token && req.query && typeof req.query.token === "string") {
    token = req.query.token;
  }
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, username, role }
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
