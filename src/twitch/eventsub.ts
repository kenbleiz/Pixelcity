/**
 * Twitch EventSub — STUB for MVP.
 *
 * Simulated events are POSTed to:
 *   POST /api/twitch/follow   { user }
 *   POST /api/twitch/sub      { user, tier? }
 *   POST /api/twitch/bits     { user, amount }
 *
 * To wire real EventSub later:
 *
 * 1. Create a Twitch application (dev.twitch.tv) and fill
 *    TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_EVENTSUB_SECRET,
 *    TWITCH_BROADCASTER_ID, TWITCH_EVENTSUB_CALLBACK_URL in `.env`.
 * 2. Expose this server with HTTPS (ngrok / Cloudflare Tunnel / VPS).
 * 3. Add Express routes:
 *      POST /twitch/eventsub
 *        - Handle `challenge` (webhook verification) by echoing the challenge.
 *        - Verify `Twitch-Eventsub-Message-Signature` HMAC-SHA256 using
 *          TWITCH_EVENTSUB_SECRET (see Twitch EventSub docs).
 *        - Switch on `subscription.type`:
 *            channel.follow              → game.handleFollow(user)
 *            channel.subscribe           → game.handleSub(user, tier)
 *            channel.subscription.gift   → game.handleSub(gifter)  (optional)
 *            channel.cheer               → game.handleBits(user, bits)
 * 4. Subscribe with the Helix API:
 *      POST https://api.twitch.tv/helix/eventsub/subscriptions
 *    using an app access token (client_credentials).
 *
 * Do not put secrets in the client. Keep verification on the server.
 */
import { config } from "../config.js";

export function twitchEventSubConfigured(): boolean {
  return Boolean(
    config.twitch.clientId &&
      config.twitch.clientSecret &&
      config.twitch.eventSubSecret &&
      config.twitch.broadcasterId &&
      config.twitch.callbackUrl,
  );
}

export function eventSubStatus(): { ready: boolean; note: string } {
  if (!twitchEventSubConfigured()) {
    return {
      ready: false,
      note: "EventSub stub — simulator HTTP API is active. Fill TWITCH_* env vars, then implement POST /twitch/eventsub.",
    };
  }
  return {
    ready: false,
    note: "Credentials present but EventSub webhook is not implemented yet (MVP stub).",
  };
}
