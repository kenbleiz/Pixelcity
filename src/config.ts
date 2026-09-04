import "dotenv/config";
import path from "node:path";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim() ? raw.trim() : fallback;
}

export const config = {
  port: num("PORT", 3000),
  host: str("HOST", "0.0.0.0"),
  cooldownMs: num("COOLDOWN_MS", 2000),
  demolishMaxPerMinute: num("DEMOLISH_MAX_PER_MINUTE", 3),
  demolishMaxPerWindow: num("DEMOLISH_MAX_PER_WINDOW", 8),
  demolishWindowMs: num("DEMOLISH_WINDOW_MS", 10 * 60 * 1000),
  goalTarget: num("GOAL_TARGET", 100),
  goalName: str("GOAL_NAME", "Métro"),
  dataFile: path.resolve(str("DATA_FILE", "data/town.json")),
  gridSize: 50,
  twitch: {
    channel: str("TWITCH_CHANNEL", ""),
    botUsername: str("TWITCH_BOT_USERNAME", ""),
    oauthToken: str("TWITCH_OAUTH_TOKEN", ""),
    clientId: str("TWITCH_CLIENT_ID", ""),
    clientSecret: str("TWITCH_CLIENT_SECRET", ""),
    eventSubSecret: str("TWITCH_EVENTSUB_SECRET", ""),
    broadcasterId: str("TWITCH_BROADCASTER_ID", ""),
    callbackUrl: str("TWITCH_EVENTSUB_CALLBACK_URL", ""),
  },
};
