import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { Game } from "../game.js";
import { Town } from "../world.js";
import {
  attachEventSub,
  dispatchEventSubNotification,
  handleEventSubPost,
  isEventSubTimestampFresh,
  signEventSubMessage,
  verifyEventSubSignature,
  type EventSubHandlers,
} from "./eventsub.js";


const SECRET = "testsecret-10plus";

function handlers() {
  const follows: string[] = [];
  const subs: [string, string][] = [];
  const bits: [string, number][] = [];
  const h: EventSubHandlers = {
    onFollow: (user) => follows.push(user),
    onSub: (user, tier) => subs.push([user, tier]),
    onBits: (user, amount) => bits.push([user, amount]),
  };
  return { h, follows, subs, bits };
}

function signedHeaders(body: Buffer, messageType: string, extra?: { messageId?: string; timestamp?: string; secret?: string }) {
  const messageId = extra?.messageId ?? "msg-1";
  const timestamp = extra?.timestamp ?? new Date().toISOString();
  const secret = extra?.secret ?? SECRET;
  return {
    messageId,
    timestamp,
    headers: {
      "twitch-eventsub-message-id": messageId,
      "twitch-eventsub-message-timestamp": timestamp,
      "twitch-eventsub-message-signature": signEventSubMessage(secret, messageId, timestamp, body),
      "twitch-eventsub-message-type": messageType,
    },
  };
}

describe("verifyEventSubSignature", () => {
  it("accepts a valid HMAC over id + timestamp + raw body", () => {
    const body = Buffer.from('{"challenge":"abc"}');
    const messageId = "id-1";
    const timestamp = "2026-09-04T12:00:00.000Z";
    const signature = signEventSubMessage(SECRET, messageId, timestamp, body);
    assert.equal(
      verifyEventSubSignature({ secret: SECRET, messageId, timestamp, body, signatureHeader: signature }),
      true,
    );
  });

  it("rejects a tampered body, wrong secret, or missing header", () => {
    const body = Buffer.from('{"ok":true}');
    const messageId = "id-2";
    const timestamp = "2026-09-04T12:00:00.000Z";
    const signature = signEventSubMessage(SECRET, messageId, timestamp, body);
    assert.equal(
      verifyEventSubSignature({
        secret: SECRET,
        messageId,
        timestamp,
        body: Buffer.from('{"ok":false}'),
        signatureHeader: signature,
      }),
      false,
    );
    assert.equal(
      verifyEventSubSignature({ secret: "othersecretxx", messageId, timestamp, body, signatureHeader: signature }),
      false,
    );
    assert.equal(
      verifyEventSubSignature({ secret: SECRET, messageId, timestamp, body, signatureHeader: undefined }),
      false,
    );
    assert.equal(
      verifyEventSubSignature({ secret: SECRET, messageId, timestamp, body, signatureHeader: "md5=deadbeef" }),
      false,
    );
  });
});

describe("isEventSubTimestampFresh", () => {
  it("accepts recent timestamps and rejects stale ones", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z");
    assert.equal(isEventSubTimestampFresh("2026-09-04T12:00:00.000Z", now), true);
    assert.equal(isEventSubTimestampFresh("2026-09-04T11:51:00.000Z", now), true);
    assert.equal(isEventSubTimestampFresh("2026-09-04T11:49:00.000Z", now), false);
    assert.equal(isEventSubTimestampFresh("not-a-date", now), false);
  });
});

describe("dispatchEventSubNotification", () => {
  it("routes follow / sub / bits onto the game handlers", () => {
    const { h, follows, subs, bits } = handlers();
    assert.equal(dispatchEventSubNotification("channel.follow", { user_name: "Finn" }, h), true);
    assert.equal(dispatchEventSubNotification("channel.subscribe", { user_name: "Sam", tier: "2000" }, h), true);
    assert.equal(
      dispatchEventSubNotification("channel.subscription.message", { user_login: "resubber", tier: "1000" }, h),
      true,
    );
    assert.equal(dispatchEventSubNotification("channel.cheer", { user_name: "Tipper", bits: 250 }, h), true);
    assert.equal(dispatchEventSubNotification("channel.cheer", { is_anonymous: true, bits: 50 }, h), true);
    assert.deepEqual(follows, ["Finn"]);
    assert.deepEqual(subs, [
      ["Sam", "2000"],
      ["resubber", "1000"],
    ]);
    assert.deepEqual(bits, [
      ["Tipper", 250],
      ["Anonyme", 50],
    ]);
  });

  it("plants a tree through Game.handleFollow like POST /api/twitch/follow", () => {
    const game = new Game(new Town());
    const { h } = handlers();
    h.onFollow = (user) => {
      game.handleFollow(user);
    };
    dispatchEventSubNotification("channel.follow", { user_name: "Finn" }, h);
    assert.equal(game.town.stats().tree, 1);
  });

  it("ignores unknown types and invalid bits", () => {
    const { h, bits } = handlers();
    assert.equal(dispatchEventSubNotification("channel.raid", { user_name: "x" }, h), false);
    assert.equal(dispatchEventSubNotification("channel.cheer", { user_name: "x", bits: 0 }, h), false);
    assert.equal(bits.length, 0);
  });
});

describe("handleEventSubPost", () => {
  it("echoes the webhook verification challenge as text/plain", () => {
    const body = Buffer.from(JSON.stringify({ challenge: "pogchamp-kappa", subscription: { type: "channel.follow" } }));
    const { headers } = signedHeaders(body, "webhook_callback_verification");
    const { h } = handlers();
    const result = handleEventSubPost(headers, body, { secret: SECRET, handlers: h });
    assert.equal(result.status, 200);
    assert.equal(result.body, "pogchamp-kappa");
    assert.match(result.contentType ?? "", /text\/plain/);
  });

  it("returns 403 on a bad signature and does not invoke handlers", () => {
    const body = Buffer.from(JSON.stringify({ event: { user_name: "Finn" }, subscription: { type: "channel.follow" } }));
    const { headers } = signedHeaders(body, "notification");
    headers["twitch-eventsub-message-signature"] = "sha256=deadbeef";
    const { h, follows } = handlers();
    const result = handleEventSubPost(headers, body, { secret: SECRET, handlers: h });
    assert.equal(result.status, 403);
    assert.equal(follows.length, 0);
  });

  it("dispatches a follow notification after a valid signature", () => {
    const body = Buffer.from(
      JSON.stringify({
        subscription: { type: "channel.follow" },
        event: { user_name: "Finn" },
      }),
    );
    const { headers } = signedHeaders(body, "notification");
    const { h, follows } = handlers();
    const result = handleEventSubPost(headers, body, { secret: SECRET, handlers: h });
    assert.equal(result.status, 204);
    assert.deepEqual(follows, ["Finn"]);
  });

  it("dedupes EventSub message ids", () => {
    const body = Buffer.from(
      JSON.stringify({
        subscription: { type: "channel.cheer" },
        event: { user_name: "Tipper", bits: 100 },
      }),
    );
    const { headers } = signedHeaders(body, "notification", { messageId: "same-id" });
    const { h, bits } = handlers();
    const seen = new Set<string>();
    assert.equal(handleEventSubPost(headers, body, { secret: SECRET, handlers: h, seenIds: seen }).status, 204);
    assert.equal(handleEventSubPost(headers, body, { secret: SECRET, handlers: h, seenIds: seen }).status, 204);
    assert.deepEqual(bits, [["Tipper", 100]]);
  });
});

describe("attachEventSub HTTP", () => {
  it("exposes GET status / GET challenge and returns 503 when the secret is unset", async () => {
    const app = express();
    attachEventSub(app, handlers().h);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}/twitch/eventsub`;
    try {
      const status = await fetch(base);
      assert.equal(status.status, 200);
      const json = (await status.json()) as { ok: boolean; method: string };
      assert.equal(json.ok, true);
      assert.equal(json.method, "POST");

      const challenge = await fetch(`${base}?challenge=pogchamp`);
      assert.equal(challenge.status, 200);
      assert.equal(await challenge.text(), "pogchamp");

      const post = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(post.status, 503);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
