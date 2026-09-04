import { config } from "./config.js";

interface CooldownHit {
  blocked: true;
  waitMs: number;
  message: string;
}

interface CooldownOk {
  blocked: false;
}

export type CooldownResult = CooldownHit | CooldownOk;

function key(user: string): string {
  return user.trim().toLowerCase();
}

export class RateLimiter {
  private lastCommand = new Map<string, number>();
  private demolishes = new Map<string, number[]>();

  checkCommand(user: string, now = Date.now()): CooldownResult {
    const k = key(user);
    const last = this.lastCommand.get(k);
    if (last === undefined) return { blocked: false };
    const wait = config.cooldownMs - (now - last);
    if (wait > 0) {
      const sec = Math.ceil(wait / 1000);
      return {
        blocked: true,
        waitMs: wait,
        message: `Cooldown — attends ${sec}s (${user}).`,
      };
    }
    return { blocked: false };
  }

  touchCommand(user: string, now = Date.now()): void {
    this.lastCommand.set(key(user), now);
  }

  checkDemolish(user: string, now = Date.now()): CooldownResult {
    const k = key(user);
    const stamps = (this.demolishes.get(k) ?? []).filter(
      (t) => now - t < config.demolishWindowMs,
    );
    this.demolishes.set(k, stamps);

    const lastMinute = stamps.filter((t) => now - t < 60_000);
    if (lastMinute.length >= config.demolishMaxPerMinute) {
      return {
        blocked: true,
        waitMs: 60_000,
        message: `Anti-spam : max ${config.demolishMaxPerMinute} démolitions / minute.`,
      };
    }
    if (stamps.length >= config.demolishMaxPerWindow) {
      return {
        blocked: true,
        waitMs: config.demolishWindowMs,
        message: `Anti-spam : un viewer ne peut pas raser la carte (${config.demolishMaxPerWindow} max / 10 min).`,
      };
    }
    return { blocked: false };
  }

  touchDemolish(user: string, now = Date.now()): void {
    const k = key(user);
    const stamps = this.demolishes.get(k) ?? [];
    stamps.push(now);
    this.demolishes.set(k, stamps);
  }
}
