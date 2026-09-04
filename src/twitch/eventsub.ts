/**
 * Twitch EventSub webhooks (follow / sub / bits).
 *
 * POST /twitch/eventsub verifies HMAC-SHA256 signatures with TWITCH_EVENTSUB_SECRET
 * and dispatches to the same Game.handleFollow / handleSub / handleBits path as
 * the simulator. On startup, when Helix credentials are present, we fetch an
 * app access token and create the subscriptions if they are not already active.
 *
 * CALLBACK_URL must be publicly reachable HTTPS (ngrok / Cloudflare Tunnel / VPS).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import express from "express";
import { config } from "../config.js";

const HELIX = "https://api.twitch.tv/helix";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const MESSAGE_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_SEEN_IDS = 500;
const HMAC_PREFIX = "sha256=";

export type EventSubHandlers = {
  onFollow: (user: string) => void;
  onSub: (user: string, tier: string) => void;
  onBits: (user: string, amount: number) => void;
};

export type EventSubHttpResult = {
  status: number;
  body?: string;
  contentType?: string;
};

export type EventSubStatus = {
  ready: boolean;
  note: string;
  subscriptions: { type: string; status: string }[];
};

type EventSubEvent = {
  user_name?: string | null;
  user_login?: string | null;
  tier?: string;
  bits?: number;
  is_anonymous?: boolean;
};

type EventSubPayload = {
  challenge?: string;
  subscription?: { type?: string; status?: string };
  event?: EventSubEvent;
};

type HelixSubscription = {
  id: string;
  status: string;
  type: string;
  version: string;
  condition?: Record<string, string>;
  transport?: { method?: string; callback?: string };
};

type DesiredSubscription = {
  type: string;
  version: string;
  condition: Record<string, string>;
};

const seenMessageIds = new Set<string>();

let subscribeState: EventSubStatus = {
  ready: false,
  note: "not started",
  subscriptions: [],
};

export function twitchEventSubWebhookConfigured(): boolean {
  return Boolean(config.twitch.eventSubSecret);
}

export function twitchEventSubConfigured(): boolean {
  return Boolean(
    config.twitch.clientId &&
      config.twitch.clientSecret &&
      config.twitch.eventSubSecret &&
      config.twitch.broadcasterId &&
      config.twitch.callbackUrl,
  );
}

export function eventSubCallbackUrl(): string {
  const raw = config.twitch.callbackUrl.trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/\/twitch\/eventsub$/i.test(raw)) return raw;
  return `${raw}/twitch/eventsub`;
}

export function eventSubStatus(): EventSubStatus {
  if (!twitchEventSubConfigured()) {
    if (twitchEventSubWebhookConfigured()) {
      return {
        ready: true,
        note: "EventSub webhook mounted. Helix auto-subscribe skipped — set TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_BROADCASTER_ID, TWITCH_EVENTSUB_CALLBACK_URL to create subscriptions on startup.",
        subscriptions: [],
      };
    }
    return {
      ready: false,
      note: "EventSub idle — simulator HTTP API is active. Fill TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_EVENTSUB_SECRET, TWITCH_BROADCASTER_ID, TWITCH_EVENTSUB_CALLBACK_URL to enable.",
      subscriptions: [],
    };
  }
  return { ...subscribeState, subscriptions: [...subscribeState.subscriptions] };
}

export function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw ?? "";
}

export function parseEventSubTimestamp(raw: string): number | null {
  if (!raw) return null;
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return direct;
  const trimmed = raw.replace(/(\.\d{3})\d+/, "$1");
  const fallback = Date.parse(trimmed);
  return Number.isFinite(fallback) ? fallback : null;
}

export function isEventSubTimestampFresh(timestamp: string, now = Date.now(), maxAgeMs = MESSAGE_MAX_AGE_MS): boolean {
  const ts = parseEventSubTimestamp(timestamp);
  if (ts === null) return false;
  return Math.abs(now - ts) <= maxAgeMs;
}

/**
 * Verify Twitch-Eventsub-Message-Signature (HMAC-SHA256 over id + timestamp + raw body).
 * Comparison is timing-safe; missing or malformed headers fail closed.
 */
export function verifyEventSubSignature(opts: {
  secret: string;
  messageId: string;
  timestamp: string;
  body: Buffer | string;
  signatureHeader: string | undefined;
}): boolean {
  const { secret, messageId, timestamp, body, signatureHeader } = opts;
  if (!secret || !messageId || !timestamp || !signatureHeader) return false;
  if (!signatureHeader.startsWith(HMAC_PREFIX)) return false;

  const expected =
    HMAC_PREFIX +
    createHmac("sha256", secret).update(messageId).update(timestamp).update(body).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function signEventSubMessage(secret: string, messageId: string, timestamp: string, body: Buffer | string): string {
  return HMAC_PREFIX + createHmac("sha256", secret).update(messageId).update(timestamp).update(body).digest("hex");
}

export function dispatchEventSubNotification(
  type: string | undefined,
  event: EventSubEvent | undefined,
  handlers: EventSubHandlers,
): boolean {
  if (!type || !event) return false;
  const user =
    (typeof event.user_name === "string" && event.user_name) ||
    (typeof event.user_login === "string" && event.user_login) ||
    "viewer";

  switch (type) {
    case "channel.follow":
      handlers.onFollow(user);
      return true;
    case "channel.subscribe":
    case "channel.subscription.message":
      handlers.onSub(user, String(event.tier ?? "1000"));
      return true;
    case "channel.cheer": {
      const name = event.is_anonymous ? "Anonyme" : user;
      const bits = Number(event.bits ?? 0);
      if (!Number.isFinite(bits) || bits <= 0) return false;
      handlers.onBits(name, bits);
      return true;
    }
    default:
      return false;
  }
}

function rememberMessageId(seen: Set<string>, id: string): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > MAX_SEEN_IDS) {
    const first = seen.values().next().value;
    if (first !== undefined) seen.delete(first);
  }
  return true;
}

export function handleEventSubPost(
  headers: Record<string, string | string[] | undefined>,
  rawBody: Buffer,
  opts: {
    secret: string;
    handlers: EventSubHandlers;
    now?: number;
    seenIds?: Set<string>;
  },
): EventSubHttpResult {
  const messageId = headerValue(headers, "twitch-eventsub-message-id");
  const timestamp = headerValue(headers, "twitch-eventsub-message-timestamp");
  const signature = headerValue(headers, "twitch-eventsub-message-signature");
  const messageType = headerValue(headers, "twitch-eventsub-message-type");

  if (
    !verifyEventSubSignature({
      secret: opts.secret,
      messageId,
      timestamp,
      body: rawBody,
      signatureHeader: signature,
    })
  ) {
    return { status: 403, body: "invalid signature" };
  }

  if (!isEventSubTimestampFresh(timestamp, opts.now ?? Date.now())) {
    return { status: 403, body: "stale timestamp" };
  }

  if (opts.seenIds && !rememberMessageId(opts.seenIds, messageId)) {
    return { status: 204 };
  }

  let payload: EventSubPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as EventSubPayload;
  } catch {
    return { status: 400, body: "invalid json" };
  }

  if (messageType === "webhook_callback_verification") {
    if (typeof payload.challenge !== "string" || !payload.challenge) {
      return { status: 400, body: "missing challenge" };
    }
    return { status: 200, body: payload.challenge, contentType: "text/plain; charset=utf-8" };
  }

  if (messageType === "revocation") {
    const type = payload.subscription?.type ?? "unknown";
    const subStatus = payload.subscription?.status ?? "unknown";
    console.warn(`[twitch/eventsub] subscription revoked: ${type} (${subStatus})`);
    return { status: 204 };
  }

  if (messageType === "notification") {
    dispatchEventSubNotification(payload.subscription?.type, payload.event, opts.handlers);
    return { status: 204 };
  }

  return { status: 204 };
}

export function attachEventSub(app: Express, handlers: EventSubHandlers): void {
  app.get("/twitch/eventsub", (req, res) => {
    const challenge = typeof req.query.challenge === "string" ? req.query.challenge : "";
    if (challenge) {
      res.status(200).type("txt").send(challenge);
      return;
    }
    res.json({
      ok: true,
      endpoint: "Twitch EventSub webhook",
      method: "POST",
      configured: twitchEventSubWebhookConfigured(),
    });
  });

  app.post(
    "/twitch/eventsub",
    express.raw({ type: () => true, limit: "1mb" }),
    (req: Request, res: Response) => {
      if (!twitchEventSubWebhookConfigured()) {
        res.status(503).json({ ok: false, message: "TWITCH_EVENTSUB_SECRET is not set" });
        return;
      }
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""), "utf8");
      const result = handleEventSubPost(req.headers, raw, {
        secret: config.twitch.eventSubSecret,
        handlers,
        seenIds: seenMessageIds,
      });
      if (result.contentType) res.setHeader("Content-Type", result.contentType);
      if (result.body !== undefined) {
        res.status(result.status).send(result.body);
      } else {
        res.sendStatus(result.status);
      }
    },
  );
}

export async function startEventSub(): Promise<void> {
  if (!twitchEventSubConfigured()) {
    if (twitchEventSubWebhookConfigured()) {
      subscribeState = {
        ready: true,
        note: "webhook mounted (secret set); Helix auto-subscribe skipped until Client ID/Secret, Broadcaster ID, and CALLBACK_URL are set.",
        subscriptions: [],
      };
    } else {
      subscribeState = {
        ready: false,
        note: "skipped — set TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_EVENTSUB_SECRET, TWITCH_BROADCASTER_ID, TWITCH_EVENTSUB_CALLBACK_URL to enable.",
        subscriptions: [],
      };
    }
    console.log(`[twitch/eventsub] ${subscribeState.note}`);
    return;
  }

  const callback = eventSubCallbackUrl();
  const secretLen = config.twitch.eventSubSecret.length;
  if (!callback.startsWith("https://")) {
    console.warn(
      `[twitch/eventsub] CALLBACK_URL must be publicly reachable HTTPS (ngrok for local). Got: ${callback || "(empty)"}`,
    );
  }
  if (secretLen < 10 || secretLen > 100) {
    console.warn("[twitch/eventsub] TWITCH_EVENTSUB_SECRET must be an ASCII string of 10–100 characters.");
  }

  try {
    const token = await getAppAccessToken();
    const existing = await listSubscriptions(token);
    const results: { type: string; status: string }[] = [];

    for (const desired of desiredSubscriptions()) {
      const matches = existing.filter(
        (sub) =>
          sub.type === desired.type &&
          sub.version === desired.version &&
          normalizeCallback(sub.transport?.callback) === normalizeCallback(callback),
      );
      const live = matches.find(
        (sub) => sub.status === "enabled" || sub.status === "webhook_callback_verification_pending",
      );
      if (live) {
        console.log(`[twitch/eventsub] already subscribed: ${desired.type} (${live.status})`);
        results.push({ type: desired.type, status: live.status });
        continue;
      }
      for (const stale of matches) {
        await deleteSubscription(token, stale.id);
        console.log(`[twitch/eventsub] removed stale ${desired.type} (${stale.status})`);
      }
      const created = await createSubscription(token, desired, callback);
      results.push({ type: desired.type, status: created });
    }

    const ready = results.some(
      (row) =>
        row.status === "enabled" ||
        row.status === "webhook_callback_verification_pending" ||
        row.status === "exists",
    );
    subscribeState = {
      ready,
      note: ready
        ? `EventSub webhook listening at ${callback}`
        : "EventSub subscriptions failed — the callback must be public HTTPS, and the broadcaster must authorize the app (see README).",
      subscriptions: results,
    };
    console.log(`[twitch/eventsub] ${subscribeState.note}`);
  } catch (err) {
    const note = err instanceof Error ? err.message : String(err);
    subscribeState = { ready: false, note, subscriptions: [] };
    console.warn(`[twitch/eventsub] startup failed: ${note}`);
  }
}

function desiredSubscriptions(): DesiredSubscription[] {
  const broadcaster = config.twitch.broadcasterId;
  return [
    {
      type: "channel.follow",
      version: "2",
      condition: { broadcaster_user_id: broadcaster, moderator_user_id: broadcaster },
    },
    { type: "channel.subscribe", version: "1", condition: { broadcaster_user_id: broadcaster } },
    { type: "channel.subscription.message", version: "1", condition: { broadcaster_user_id: broadcaster } },
    { type: "channel.cheer", version: "1", condition: { broadcaster_user_id: broadcaster } },
  ];
}

function normalizeCallback(url: string | undefined): string {
  return (url ?? "").trim().replace(/\/+$/, "").toLowerCase();
}

async function getAppAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.twitch.clientId,
    client_secret: config.twitch.clientSecret,
    grant_type: "client_credentials",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`app access token failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = JSON.parse(text) as { access_token?: string };
  if (!json.access_token) throw new Error("app access token response missing access_token");
  return json.access_token;
}

function helixHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Client-Id": config.twitch.clientId,
    "Content-Type": "application/json",
  };
}

async function listSubscriptions(token: string): Promise<HelixSubscription[]> {
  const out: HelixSubscription[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${HELIX}/eventsub/subscriptions`);
    if (cursor) url.searchParams.set("after", cursor);
    const res = await fetch(url, { headers: helixHeaders(token) });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`list subscriptions failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const json = JSON.parse(text) as {
      data?: HelixSubscription[];
      pagination?: { cursor?: string };
    };
    out.push(...(json.data ?? []));
    cursor = json.pagination?.cursor;
    if (!cursor) break;
  }
  return out;
}

async function deleteSubscription(token: string, id: string): Promise<void> {
  const url = new URL(`${HELIX}/eventsub/subscriptions`);
  url.searchParams.set("id", id);
  const res = await fetch(url, { method: "DELETE", headers: helixHeaders(token) });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    console.warn(`[twitch/eventsub] delete ${id} failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

async function createSubscription(
  token: string,
  desired: DesiredSubscription,
  callback: string,
): Promise<string> {
  const res = await fetch(`${HELIX}/eventsub/subscriptions`, {
    method: "POST",
    headers: helixHeaders(token),
    body: JSON.stringify({
      type: desired.type,
      version: desired.version,
      condition: desired.condition,
      transport: {
        method: "webhook",
        callback,
        secret: config.twitch.eventSubSecret,
      },
    }),
  });
  const text = await res.text();
  if (res.status === 409) {
    console.log(`[twitch/eventsub] ${desired.type} already exists`);
    return "exists";
  }
  if (res.status === 403) {
    console.warn(
      `[twitch/eventsub] ${desired.type} forbidden — the broadcaster must authorize the app with the required scope (see README). ${text.slice(0, 200)}`,
    );
    return "forbidden";
  }
  if (!res.ok) {
    console.warn(`[twitch/eventsub] create ${desired.type} failed (${res.status}): ${text.slice(0, 300)}`);
    return `error:${res.status}`;
  }
  const json = JSON.parse(text) as { data?: { status?: string }[] };
  const status = json.data?.[0]?.status ?? "accepted";
  console.log(`[twitch/eventsub] subscribed ${desired.type} (${status})`);
  return status;
}
