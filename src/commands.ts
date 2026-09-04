import type { ChatCommandName, ParsedCommand } from "./types.js";

const COMMANDS = new Set<ChatCommandName>(["build", "road", "park", "demolish", "vote"]);

export function parseCommand(raw: string): ParsedCommand | null {
  const text = raw.trim();
  if (!text.startsWith("!")) return null;
  const parts = text.slice(1).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const name = parts[0]!.toLowerCase() as ChatCommandName;
  if (!COMMANDS.has(name)) return null;

  if (name === "vote") return { name };

  if (parts.length >= 3) {
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return { name };
    }
    return { name, x, y };
  }
  return { name };
}
