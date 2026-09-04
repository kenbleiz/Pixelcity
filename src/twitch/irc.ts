/**
 * Twitch IRC chat ingestion — STUB for MVP.
 *
 * The live tool currently receives chat via POST /api/chat (simulator).
 * To wire a real channel later:
 *
 * 1. Create a Twitch bot account (or use the streamer account).
 * 2. Generate an OAuth token: https://twitchtokengenerator.com/ or Twitch CLI
 *    (`twitch token -u -s "chat:read"`).
 * 3. Fill TWITCH_CHANNEL, TWITCH_BOT_USERNAME, TWITCH_OAUTH_TOKEN in `.env`.
 * 4. Install a client, e.g. `npm i tmi.js`, then in `connectIrc()`:
 *
 *    import tmi from "tmi.js";
 *    const client = new tmi.Client({
 *      identity: { username: config.twitch.botUsername, password: config.twitch.oauthToken },
 *      channels: [config.twitch.channel],
 *    });
 *    client.on("message", (_ch, tags, message, self) => {
 *      if (self) return;
 *      const user = tags["display-name"] || tags.username || "viewer";
 *      onChat(user, message); // reuse Game.handleChat
 *    });
 *    await client.connect();
 *
 * Keep command parsing in src/commands.ts so IRC and the simulator share one path.
 */
import { config } from "../config.js";

export function twitchIrcConfigured(): boolean {
  return Boolean(config.twitch.channel && config.twitch.botUsername && config.twitch.oauthToken);
}

export async function connectIrc(_onChat: (user: string, message: string) => void): Promise<void> {
  if (!twitchIrcConfigured()) {
    console.log("[twitch/irc] skipped — set TWITCH_CHANNEL / TWITCH_BOT_USERNAME / TWITCH_OAUTH_TOKEN to enable.");
    return;
  }
  // TODO: connect tmi.js (or raw IRC) and forward messages to _onChat.
  console.warn("[twitch/irc] credentials present but IRC client is not implemented yet (MVP stub).");
}
