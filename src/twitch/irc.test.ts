import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Game } from "../game.js";
import { Town } from "../world.js";
import { normalizeOauthToken, routeIrcMessage } from "./irc.js";


describe("normalizeOauthToken", () => {
  it("adds the oauth: prefix when missing", () => {
    assert.equal(normalizeOauthToken("abc123"), "oauth:abc123");
    assert.equal(normalizeOauthToken("  xyz  "), "oauth:xyz");
  });

  it("does not double the prefix", () => {
    assert.equal(normalizeOauthToken("oauth:abc123"), "oauth:abc123");
    assert.equal(normalizeOauthToken("OAUTH:abc123"), "oauth:abc123");
  });
});

describe("routeIrcMessage", () => {
  it("ignores self and empty messages", () => {
    const calls: [string, string][] = [];
    const onChat = (user: string, message: string) => calls.push([user, message]);
    assert.equal(routeIrcMessage({ username: "bot" }, "!build", true, onChat), false);
    assert.equal(routeIrcMessage({ username: "ada" }, "   ", false, onChat), false);
    assert.equal(calls.length, 0);
  });

  it("forwards display-name and the raw command to the chat pipeline", () => {
    const calls: [string, string][] = [];
    const ok = routeIrcMessage(
      { username: "ada", "display-name": "Ada" },
      "!build 3 7",
      false,
      (user, message) => calls.push([user, message]),
    );
    assert.equal(ok, true);
    assert.deepEqual(calls, [["Ada", "!build 3 7"]]);
  });

  it("drives Game.handleChat like POST /api/chat", () => {
    const game = new Game(new Town());
    routeIrcMessage({ "display-name": "Ada", username: "ada" }, "!build 5 5", false, (user, message) => {
      game.handleChat(user, message);
    });
    assert.equal(game.town.get(5, 5).type, "house");
    assert.equal(game.town.get(5, 5).builder, "Ada");
  });

  it("falls back to username then viewer", () => {
    const calls: [string, string][] = [];
    routeIrcMessage({ username: "bob" }, "!vote", false, (u, m) => calls.push([u, m]));
    routeIrcMessage({}, "!park", false, (u, m) => calls.push([u, m]));
    assert.deepEqual(calls, [
      ["bob", "!vote"],
      ["viewer", "!park"],
    ]);
  });
});
