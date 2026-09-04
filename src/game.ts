import { RateLimiter } from "./cooldown.js";
import { parseCommand } from "./commands.js";
import type { MutationResult } from "./types.js";
import type { Town } from "./world.js";

export class Game {
  readonly town: Town;
  readonly limiter = new RateLimiter();

  constructor(town: Town) {
    this.town = town;
  }

  handleChat(user: string, message: string): MutationResult {
    const name = user.trim() || "Anonyme";
    const parsed = parseCommand(message);
    if (!parsed) {
      return { ok: false, message: "Commande inconnue. Essaie !build !road !park !demolish !vote" };
    }

    const cool = this.limiter.checkCommand(name);
    if (cool.blocked) return { ok: false, message: cool.message };

    if (parsed.name === "demolish") {
      const demo = this.limiter.checkDemolish(name);
      if (demo.blocked) return { ok: false, message: demo.message };
    }

    this.limiter.touchCommand(name);

    let result: MutationResult;
    switch (parsed.name) {
      case "build":
        result = this.town.place("house", name, parsed.x, parsed.y);
        break;
      case "road":
        result = this.town.place("road", name, parsed.x, parsed.y);
        break;
      case "park":
        result = this.town.place("park", name, parsed.x, parsed.y);
        break;
      case "demolish":
        result = this.town.demolish(name, parsed.x, parsed.y);
        if (result.ok) this.limiter.touchDemolish(name);
        break;
      case "vote":
        result = this.town.vote(name);
        break;
    }
    return result;
  }

  handleFollow(user: string): MutationResult {
    return this.town.follow(user.trim() || "viewer");
  }

  handleSub(user: string, tier = "1000"): MutationResult {
    return this.town.sub(user.trim() || "subscriber", tier);
  }

  handleBits(user: string, amount: number): MutationResult {
    return this.town.bits(user.trim() || "tipper", amount);
  }
}
