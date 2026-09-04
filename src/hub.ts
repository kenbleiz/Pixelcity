import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMessage } from "./types.js";

export class Hub {
  private wss: WebSocketServer | null = null;

  attach(wss: WebSocketServer): void {
    this.wss = wss;
    wss.on("connection", (socket) => {
      socket.on("message", (raw) => {
        const text = raw.toString();
        if (text === "ping") this.send(socket, { type: "pong" });
      });
    });
  }

  send(socket: WebSocket, message: ClientMessage): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  broadcast(message: ClientMessage): void {
    if (!this.wss) return;
    const payload = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  }
}
