import { createServer } from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { Game } from "./game.js";
import { Hub } from "./hub.js";
import { connectIrc, ircStatus } from "./twitch/irc.js";
import { attachEventSub, eventSubStatus, startEventSub } from "./twitch/eventsub.js";
import { Town } from "./world.js";
import type { MutationResult } from "./types.js";

const app = express();

const town = await Town.create();
const game = new Game(town);
const hub = new Hub();

function publish(result: MutationResult): MutationResult {
  if (result.ok) {
    void town.persist().catch((err) => {
      console.error("[town] persist failed", err);
    });
    hub.broadcast({ type: "state", payload: town.snapshot() });
    for (const event of result.events) {
      hub.broadcast({ type: "event", payload: event });
    }
    if (result.flash && result.bitsAmount) {
      const user = result.events[0]?.user ?? "viewer";
      hub.broadcast({ type: "flash", payload: { user, amount: result.bitsAmount } });
    }
  }
  return result;
}

// Raw body required for HMAC — must be mounted before express.json().
attachEventSub(app, {
  onFollow: (user) => {
    publish(game.handleFollow(user));
  },
  onSub: (user, tier) => {
    publish(game.handleSub(user, tier));
  },
  onBits: (user, amount) => {
    publish(game.handleBits(user, amount));
  },
});

app.use(express.json({ limit: "32kb" }));

app.get("/api/state", (_req, res) => {
  res.json(town.snapshot());
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    name: "Chatville / Pixelcity",
    irc: ircStatus(),
    eventSub: eventSubStatus(),
  });
});

app.post("/api/chat", (req, res) => {
  const user = String(req.body?.user ?? "viewer");
  const message = String(req.body?.message ?? "");
  const result = publish(game.handleChat(user, message));
  res.status(result.ok ? 200 : 400).json(result);
});

app.post("/api/twitch/follow", (req, res) => {
  const user = String(req.body?.user ?? "follower");
  const result = publish(game.handleFollow(user));
  res.status(result.ok ? 200 : 400).json(result);
});

app.post("/api/twitch/sub", (req, res) => {
  const user = String(req.body?.user ?? "subscriber");
  const tier = String(req.body?.tier ?? "1000");
  const result = publish(game.handleSub(user, tier));
  res.status(result.ok ? 200 : 400).json(result);
});

app.post("/api/twitch/bits", (req, res) => {
  const user = String(req.body?.user ?? "tipper");
  const amount = Number(req.body?.amount ?? 100);
  const result = publish(game.handleBits(user, amount));
  res.status(result.ok ? 200 : 400).json(result);
});

app.get(["/overlay", "/overlay/town"], (_req, res) => {
  res.sendFile("overlay/town.html", { root: "public" });
});

app.get("/overlay/alerts", (_req, res) => {
  res.sendFile("overlay/alerts.html", { root: "public" });
});

app.get("/overlay/goal", (_req, res) => {
  res.sendFile("overlay/goal.html", { root: "public" });
});

app.get("/simulator", (_req, res) => {
  res.sendFile("simulator/index.html", { root: "public" });
});

app.get("/", (_req, res) => {
  res.sendFile("simulator/index.html", { root: "public" });
});

app.use(express.static("public"));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
hub.attach(wss);

wss.on("connection", (socket) => {
  hub.send(socket, { type: "state", payload: town.snapshot() });
});

server.listen(config.port, config.host, () => {
  console.log(`Chatville listening on http://${config.host}:${config.port}`);
  console.log(`  Town overlay : http://localhost:${config.port}/overlay`);
  console.log(`  Alerts       : http://localhost:${config.port}/overlay/alerts`);
  console.log(`  Goal         : http://localhost:${config.port}/overlay/goal`);
  console.log(`  Simulator    : http://localhost:${config.port}/simulator`);
  void connectIrc((user, message) => {
    publish(game.handleChat(user, message));
  });
  void startEventSub();
});
