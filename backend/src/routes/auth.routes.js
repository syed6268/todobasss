import { Router } from "express";
import { config } from "../config/env.js";
import {
  getAuthUrl,
  exchangeCodeForTokens,
  isAuthenticated,
} from "../services/gcal.service.js";
import { clearTokens } from "../data/tokenStore.js";

const router = Router();

router.get("/google/status", (req, res) => {
  res.json({ connected: isAuthenticated() });
});

router.get("/google", (req, res) => {
  try {
    const url = getAuthUrl();
    res.redirect(url);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/google/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.redirect(`${config.google.frontendUrl}?gcal=error`);
  }
  if (!code) {
    return res.status(400).send("Missing authorization code");
  }
  try {
    const tokens = await exchangeCodeForTokens(code);
    if (tokens.refresh_token) {
      console.log("\n=================================================");
      console.log("Google Calendar connected!");
      console.log("Refresh token (optional, paste into backend/.env):");
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log("=================================================\n");
    }
    res.redirect(`${config.google.frontendUrl}?gcal=connected`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.redirect(`${config.google.frontendUrl}?gcal=error`);
  }
});

router.post("/google/disconnect", (req, res) => {
  clearTokens();
  res.json({ disconnected: true });
});

export default router;
