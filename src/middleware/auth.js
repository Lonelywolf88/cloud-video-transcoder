import { CognitoJwtVerifier } from "aws-jwt-verify";

let verifier;

/** Ensure verifier is initialized after secrets are loaded */
function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.COGNITO_USER_POOL_ID,
      tokenUse: "id", // IdToken includes cognito:groups
      clientId: process.env.COGNITO_CLIENT_ID,
    });
  }
  return verifier;
}

export async function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = await getVerifier().verify(token);

    req.user = payload;
    req.user.groups = payload["cognito:groups"] || [];

    next();
  } catch (err) {
    console.error("JWT verify failed:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireGroup(group) {
  return (req, res, next) => {
    if (req.user?.groups.includes(group)) {
      return next();
    }
    return res
      .status(403)
      .json({ error: `Only ${group}s are allowed to delete this video` });
  };
}
