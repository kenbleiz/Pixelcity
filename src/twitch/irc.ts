/**
 * Twitch IRC chat ingestion via tmi.js.
 *
 * Enabled when TWITCH_CHANNEL and TWITCH_OAUTH_TOKEN are set
 * (TWITCH_BOT_USERNAME optional — falls back to the channel name).
 * Missing credentials is a no-op so the simulator still works alone.
 *
 * Chat is forwarded to the same Game.handleChat pipeline as POST /api/chat.
 */
import { Client, type ChatUserstate } from "tmi.js";
import { config } from "../config.js";

export type IrcUserTags = {
  username?: string;
  "display-name"?: string;
};

export type IrcStatus = {
  configured: boolean;
  connected: boolean;
  note: string;
};

const MAX_BACKOFF_MS = 30_000;

let status: IrcStatus = {
  configured: false,
  connected: false,
  note: "not started",
};

export function twitchIrcConfigured(): boolean {
  return Boolean(config.twitch.channel && config.twitch.oauthToken);
}

export function ircStatus(): IrcStatus {
  return { ...status };
}

export function ircChannel(): string {
  return config.twitch.channel.replace(/^#/, "").toLowerCase();
}

export function ircUsername(): string {
  const name = config.twitch.botUsername || config.twitch.channel;
  return name.replace(/^#/, "").toLowerCase();
}

/** twitchapps.com/tmi returns `oauth:…`; some generators omit the prefix. */
export function normalizeOauthToken(token: string): string {
  const trimmed = token.trim();
  if (/^oauth:/i.test(trimmed)) return `oauth:${trimmed.slice("oauth:".length)}`;
  return `oauth:${trimmed}`;
}

/**
 * Map a tmi.js PRIVMSG onto the shared chat pipeline.
 * Returns true when `onChat` was invoked.
 */
export function routeIrcMessage(
  tags: IrcUserTags,
  message: string,
  self: boolean,
  onChat: (user: string, message: string) => void,
): boolean {
  if (self) return false;
  const text = message ?? "";
  if (!text.trim()) return false;
  const user = tags["display-name"] || tags.username || "viewer";
  onChat(user, text);
  return true;
}

export async function connectIrc(onChat: (user: string, message: string) => void): Promise<void> {
  if (!twitchIrcConfigured()) {
    status = {
      configured: false,
      connected: false,
      note: "skipped — set TWITCH_CHANNEL and TWITCH_OAUTH_TOKEN (optional TWITCH_BOT_USERNAME) to enable.",
    };
    console.log(`[twitch/irc] ${status.note}`);
    return;
  }

  const channel = ircChannel();
  const username = ircUsername();
  status = {
    configured: true,
    connected: false,
    note: `connecting to #${channel} as ${username}`,
  };
  console.log(`[twitch/irc] ${status.note}`);

  const client = new Client({
    options: { skipMembership: true },
    connection: {
      secure: true,
      reconnect: true,
      reconnectInterval: 1000,
      reconnectDecay: 1.5,
      maxReconnectInterval: MAX_BACKOFF_MS,
      maxReconnectAttempts: Infinity,
    },
    identity: {
      username,
      password: normalizeOauthToken(config.twitch.oauthToken),
    },
    channels: [channel],
  });

  client.on("message", (_ch: string, tags: ChatUserstate, message: string, self: boolean) => {
    routeIrcMessage(tags, message, self, onChat);
  });

  client.on("connected", (addr: string, port: number) => {
    status = {
      configured: true,
      connected: true,
      note: `connected to #${channel} as ${username} (${addr}:${port})`,
    };
    console.log(`[twitch/irc] ${status.note}`);
  });

  client.on("disconnected", (reason: string) => {
    status.connected = false;
    status.note = `disconnected (${reason || "unknown"}) — reconnecting with backoff`;
    console.warn(`[twitch/irc] ${status.note}`);
  });

  client.on("reconnect", () => {
    console.log("[twitch/irc] reconnecting…");
  });

  await connectWithBackoff(client);
}

async function connectWithBackoff(client: Client): Promise<void> {
  let attempt = 0;
  for (;;) {
    try {
      await client.connect();
      return;
    } catch (err) {
      attempt += 1;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempt - 1, 8));
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`[twitch/irc] connect failed (attempt ${attempt}), retry in ${delay}ms: ${detail}`);
      await sleep(delay);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
