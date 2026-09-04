import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCommand } from "./commands.js";
import { RateLimiter } from "./cooldown.js";
import { Game } from "./game.js";
import { Town } from "./world.js";

describe("parseCommand", () => {
  it("is case-insensitive and accepts optional coordinates", () => {
    assert.deepEqual(parseCommand("!BUILD"), { name: "build" });
    assert.deepEqual(parseCommand("  !Road 3 7 "), { name: "road", x: 3, y: 7 });
    assert.deepEqual(parseCommand("!park"), { name: "park" });
    assert.deepEqual(parseCommand("!demolish 1 2"), { name: "demolish", x: 1, y: 2 });
    assert.deepEqual(parseCommand("!vote"), { name: "vote" });
  });

  it("ignores unknown and non-commands", () => {
    assert.equal(parseCommand("hello"), null);
    assert.equal(parseCommand("!dance"), null);
    assert.equal(parseCommand(""), null);
  });
});

describe("Town", () => {
  it("starts empty on a 50×50 grid", () => {
    const town = new Town();
    assert.equal(town.width, 50);
    assert.equal(town.stats().empty, 2500);
  });

  it("places a house on a free cell and records the builder", () => {
    const town = new Town();
    const result = town.place("house", "Ada", 10, 11);
    assert.equal(result.ok, true);
    const tile = town.get(10, 11);
    assert.equal(tile.type, "house");
    assert.equal(tile.builder, "Ada");
    assert.equal(town.stats().house, 1);
  });

  it("rejects occupied and out-of-bounds cells", () => {
    const town = new Town();
    town.place("road", "Ada", 4, 4);
    assert.equal(town.place("house", "Bob", 4, 4).ok, false);
    assert.equal(town.place("house", "Bob", -1, 0).ok, false);
    assert.equal(town.place("house", "Bob", 50, 0).ok, false);
  });

  it("auto-picks an empty cell", () => {
    const town = new Town();
    const result = town.place("park", "Cara");
    assert.equal(result.ok, true);
    assert.equal(town.stats().park, 1);
  });

  it("demolishes non-protected tiles and refuses metro", () => {
    const town = new Town();
    town.place("tree", "Ada", 2, 2);
    const gone = town.demolish("Bob", 2, 2);
    assert.equal(gone.ok, true);
    assert.equal(town.get(2, 2).type, "empty");

    town.goal.votes = town.goal.target;
    town.vote("Ada");
    const metro = town.get(25, 25);
    assert.equal(metro.type, "metro");
    assert.equal(metro.protected, true);
    assert.equal(town.demolish("Bob", 25, 25).ok, false);
  });

  it("follow plants a tree, sub places house or shop, bits logs a tip", () => {
    const town = new Town();
    assert.equal(town.follow("Finn").ok, true);
    assert.equal(town.stats().tree, 1);
    const sub = town.sub("Sam");
    assert.equal(sub.ok, true);
    assert.ok(town.stats().house + town.stats().shop >= 1);
    const bits = town.bits("Tipper", 250);
    assert.equal(bits.ok, true);
    assert.equal(bits.flash, true);
    assert.equal(town.lastTip?.amount, 250);
    assert.equal(town.lastTip?.user, "Tipper");
  });

  it("vote ticks goal progress and unlocks metro at target", () => {
    const town = new Town();
    town.goal.target = 3;
    town.vote("A");
    town.vote("B");
    const last = town.vote("C");
    assert.equal(town.goal.unlocked, true);
    assert.ok(last.events.some((e) => e.kind === "goal"));
    assert.equal(town.stats().metro > 0, true);
  });

  it("snapshot round-trips through hydrate", () => {
    const a = new Town();
    a.place("house", "Ada", 1, 1);
    a.vote("Ada");
    const b = new Town();
    b.hydrate(a.snapshot());
    assert.equal(b.get(1, 1).builder, "Ada");
    assert.equal(b.goal.votes, 1);
  });
});

describe("anti-spam", () => {
  it("enforces a per-user command cooldown", () => {
    const limiter = new RateLimiter();
    assert.equal(limiter.checkCommand("Ada", 1000).blocked, false);
    limiter.touchCommand("Ada", 1000);
    assert.equal(limiter.checkCommand("Ada", 1500).blocked, true);
    assert.equal(limiter.checkCommand("ada", 1500).blocked, true);
    assert.equal(limiter.checkCommand("Bob", 1500).blocked, false);
    assert.equal(limiter.checkCommand("Ada", 4000).blocked, false);
  });

  it("caps demolitions so one user cannot wipe the map", () => {
    const limiter = new RateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) {
      assert.equal(limiter.checkDemolish("Griefer", t0 + i * 100).blocked, false);
      limiter.touchDemolish("Griefer", t0 + i * 100);
    }
    const blocked = limiter.checkDemolish("Griefer", t0 + 400);
    assert.equal(blocked.blocked, true);
    assert.match(blocked.message, /Anti-spam/i);
  });
});

describe("Game chat commands", () => {
  it("runs !build / !road / !park / !vote", () => {
    const game = new Game(new Town());
    assert.equal(game.handleChat("Ada", "!build 5 5").ok, true);
    assert.equal(game.town.get(5, 5).type, "house");
    assert.equal(game.handleChat("Bob", "!road 5 6").ok, true);
    assert.equal(game.handleChat("Cara", "!park 6 5").ok, true);
    assert.equal(game.handleChat("Ada", "!vote").ok, false);
    assert.equal(game.handleChat("Dan", "!vote").ok, true);
    assert.equal(game.town.goal.votes, 1);
  });
});
