import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_FILE = path.join(__dirname, "..", "..", ".tokens.json");

let cached = null;

function loadFromDisk() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const raw = fs.readFileSync(TOKEN_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("Could not load tokens from disk:", err.message);
  }
  return null;
}

export function getStoredTokens() {
  if (cached) return cached;
  cached = loadFromDisk();
  return cached;
}

export function saveTokens(tokens) {
  cached = tokens;
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf8");
  } catch (err) {
    console.warn("Could not persist tokens to disk:", err.message);
  }
}

export function clearTokens() {
  cached = null;
  try {
    if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
  } catch (err) {
    console.warn("Could not clear token file:", err.message);
  }
}
