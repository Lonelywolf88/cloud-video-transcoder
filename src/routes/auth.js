import { Router } from "express";
import crypto from "crypto";
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  AuthFlowType,
} from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION,
});

// Helper: build secret hash if client has a secret
function secretHash(username) {
  if (!process.env.COGNITO_CLIENT_SECRET) return undefined;
  const hasher = crypto.createHmac("sha256", process.env.COGNITO_CLIENT_SECRET);
  hasher.update(`${username}${process.env.COGNITO_CLIENT_ID}`);
  return hasher.digest("base64");
}

export function authRoutes() {
  const router = Router();

  // Register user
  router.post("/register", async (req, res) => {
    const { username, password, email } = req.body;
    if (!username || !password || !email) {
      return res.status(400).json({ error: "username, password, email required" });
    }

    try {
      await client.send(
        new SignUpCommand({
          ClientId: process.env.COGNITO_CLIENT_ID,
          Username: username,
          Password: password,
          SecretHash: secretHash(username),
          UserAttributes: [{ Name: "email", Value: email }],
        })
      );
      res.json({ message: "Check email for confirmation code" });
    } catch (err) {
      console.error("Cognito signup failed:", err);
      res.status(400).json({ error: err.message || "Signup failed" });
    }
  });

  // Confirm user email
  router.post("/confirm", async (req, res) => {
    const { username, code } = req.body;
    if (!username || !code) {
      return res.status(400).json({ error: "username and code required" });
    }

    try {
      await client.send(
        new ConfirmSignUpCommand({
          ClientId: process.env.COGNITO_CLIENT_ID,
          Username: username,
          ConfirmationCode: code,
          SecretHash: secretHash(username),
        })
      );
      res.json({ message: "Account confirmed" });
    } catch (err) {
      console.error("Cognito confirm failed:", err);
      res.status(400).json({ error: err.message || "Confirm failed" });
    }
  });

  // Login user
  router.post("/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "username and password required" });
    }

    try {
      const result = await client.send(
        new InitiateAuthCommand({
          AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
          ClientId: process.env.COGNITO_CLIENT_ID,
          AuthParameters: {
            USERNAME: username,
            PASSWORD: password,
            ...(process.env.COGNITO_CLIENT_SECRET
              ? { SECRET_HASH: secretHash(username) }
              : {}),
          },
        })
      );

      const token = result.AuthenticationResult.IdToken;
      res.json({ token });
    } catch (err) {
      console.error("Cognito login failed:", err);
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  return router;
}
