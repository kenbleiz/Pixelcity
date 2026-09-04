import { config } from "./config.js";
import { loadSnapshot, saveSnapshot } from "./store.js";
import type {
  GoalState,
  MutationResult,
  PlaceableType,
  Tile,
  TileType,
  TownEvent,
  WorldSnapshot,
} from "./types.js";
import { TILE_TYPES } from "./types.js";

const EMPTY: Tile = { type: "empty", builder: null, builtAt: null, protected: false };

function emptyTile(): Tile {
  return { ...EMPTY };
}

function id(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class Town {
  readonly width: number;
  readonly height: number;
  private tiles: Tile[];
  goal: GoalState;
  lastTip: WorldSnapshot["lastTip"] = null;
  lastEvent: TownEvent | null = null;
  recentEvents: TownEvent[] = [];

  constructor(size = config.gridSize) {
    this.width = size;
    this.height = size;
    this.tiles = Array.from({ length: size * size }, emptyTile);
    this.goal = {
      name: config.goalName,
      reward: "station de métro",
      target: config.goalTarget,
      votes: 0,
      houseCount: 0,
      current: 0,
      unlocked: false,
    };
  }

  static async create(): Promise<Town> {
    const town = new Town();
    const saved = await loadSnapshot();
    if (saved) town.hydrate(saved);
    town.recompute();
    return town;
  }

  hydrate(snapshot: WorldSnapshot): void {
    if (snapshot.width !== this.width || snapshot.height !== this.height) return;
    if (snapshot.tiles.length !== this.tiles.length) return;
    this.tiles = snapshot.tiles.map((t) => ({
      type: TILE_TYPES.includes(t.type) ? t.type : "empty",
      builder: t.builder ?? null,
      builtAt: t.builtAt ?? null,
      protected: Boolean(t.protected),
    }));
    this.goal = {
      ...this.goal,
      ...snapshot.goal,
      target: snapshot.goal?.target ?? config.goalTarget,
      name: snapshot.goal?.name ?? config.goalName,
    };
    this.lastTip = snapshot.lastTip ?? null;
    this.lastEvent = snapshot.lastEvent ?? null;
    this.recentEvents = snapshot.recentEvents ?? [];
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Tile {
    return this.tiles[this.idx(x, y)]!;
  }

  snapshot(): WorldSnapshot {
    return {
      width: this.width,
      height: this.height,
      tiles: this.tiles.map((t) => ({ ...t })),
      goal: { ...this.goal },
      lastTip: this.lastTip ? { ...this.lastTip } : null,
      lastEvent: this.lastEvent ? { ...this.lastEvent } : null,
      recentEvents: this.recentEvents.map((e) => ({ ...e })),
      stats: this.stats(),
    };
  }

  stats(): Record<TileType, number> {
    const counts = Object.fromEntries(TILE_TYPES.map((t) => [t, 0])) as Record<TileType, number>;
    for (const tile of this.tiles) counts[tile.type] += 1;
    return counts;
  }

  persist(): Promise<void> {
    return saveSnapshot(this.snapshot());
  }

  private pushEvent(event: TownEvent): void {
    this.lastEvent = event;
    this.recentEvents.unshift(event);
    this.recentEvents = this.recentEvents.slice(0, 24);
  }

  private recompute(): void {
    const stats = this.stats();
    this.goal.houseCount = stats.house;
    this.goal.current = stats.house + this.goal.votes;
  }

  private neighbors(x: number, y: number): number {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (this.inBounds(nx, ny) && this.get(nx, ny).type !== "empty") n += 1;
      }
    }
    return n;
  }

  findEmptyCell(prefer: "cluster" | "outskirts" = "cluster"): { x: number; y: number } | null {
    const empties: { x: number; y: number; score: number }[] = [];
    const cx = (this.width - 1) / 2;
    const cy = (this.height - 1) / 2;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y).type !== "empty") continue;
        const neigh = this.neighbors(x, y);
        const dist = Math.abs(x - cx) + Math.abs(y - cy);
        const jitter = Math.random() * 0.4;
        const score =
          prefer === "cluster"
            ? neigh * 4 - dist * 0.08 + jitter
            : -neigh * 2 - dist * 0.02 + jitter;
        empties.push({ x, y, score });
      }
    }
    if (empties.length === 0) return null;
    empties.sort((a, b) => b.score - a.score);
    const pickFrom = empties.slice(0, Math.min(12, empties.length));
    return pickFrom[Math.floor(Math.random() * pickFrom.length)]!;
  }

  findDemolishCell(): { x: number; y: number } | null {
    const candidates: { x: number; y: number }[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.get(x, y);
        if (tile.type === "empty" || tile.protected || tile.type === "metro") continue;
        candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)]!;
  }

  place(
    type: PlaceableType,
    user: string,
    x?: number,
    y?: number,
    opts: { protect?: boolean; prefer?: "cluster" | "outskirts" } = {},
  ): MutationResult {
    let px = x;
    let py = y;
    if (px === undefined || py === undefined) {
      const found = this.findEmptyCell(opts.prefer ?? "cluster");
      if (!found) return { ok: false, message: "La carte est pleine." };
      px = found.x;
      py = found.y;
    }
    if (!this.inBounds(px, py)) {
      return { ok: false, message: `Coordonnées hors carte (0–${this.width - 1}).` };
    }
    const current = this.get(px, py);
    if (current.type !== "empty") {
      return { ok: false, message: `Case (${px}, ${py}) occupée (${current.type}).` };
    }

    const now = Date.now();
    this.tiles[this.idx(px, py)] = {
      type,
      builder: user,
      builtAt: now,
      protected: Boolean(opts.protect),
    };

    const labels: Record<PlaceableType, string> = {
      tree: "un arbre",
      road: "une route",
      park: "un parc",
      house: "une maison",
      shop: "une boutique",
      metro: "une station de métro",
    };

    const event: TownEvent = {
      id: id(),
      kind: type === "house" || type === "shop" || type === "tree" || type === "metro" ? "build" : type,
      user,
      message: `${user} a posé ${labels[type]} en (${px}, ${py})`,
      at: now,
      x: px,
      y: py,
    };

    this.recompute();
    const unlockedNow = this.maybeFinishUnlock(user);
    const events = [event, ...unlockedNow];
    for (const e of events) this.pushEvent(e);
    return { ok: true, message: event.message, events };
  }

  demolish(user: string, x?: number, y?: number): MutationResult {
    let px = x;
    let py = y;
    if (px === undefined || py === undefined) {
      const found = this.findDemolishCell();
      if (!found) return { ok: false, message: "Rien à démolir." };
      px = found.x;
      py = found.y;
    }
    if (!this.inBounds(px, py)) {
      return { ok: false, message: `Coordonnées hors carte (0–${this.width - 1}).` };
    }
    const tile = this.get(px, py);
    if (tile.type === "empty") {
      return { ok: false, message: `Rien à démolir en (${px}, ${py}).` };
    }
    if (tile.protected || tile.type === "metro") {
      return { ok: false, message: "Cette case est protégée." };
    }

    const prev = tile.type;
    this.tiles[this.idx(px, py)] = emptyTile();
    this.recompute();
    const event: TownEvent = {
      id: id(),
      kind: "demolish",
      user,
      message: `${user} a démoli ${prev} en (${px}, ${py})`,
      at: Date.now(),
      x: px,
      y: py,
    };
    this.pushEvent(event);
    return { ok: true, message: event.message, events: [event] };
  }

  vote(user: string): MutationResult {
    this.goal.votes += 1;
    this.recompute();
    const event: TownEvent = {
      id: id(),
      kind: "vote",
      user,
      message: `${user} vote pour le ${this.goal.name} (${this.goal.current}/${this.goal.target})`,
      at: Date.now(),
    };
    const extra = this.maybeFinishUnlock(user);
    const events = [event, ...extra];
    for (const e of events) this.pushEvent(e);
    return { ok: true, message: event.message, events };
  }

  follow(user: string): MutationResult {
    const result = this.place("tree", user, undefined, undefined, { prefer: "outskirts" });
    if (!result.ok) return result;
    const event: TownEvent = {
      ...result.events[0]!,
      kind: "follow",
      message: `${user} follow — un arbre pousse !`,
    };
    result.events[0] = event;
    this.lastEvent = event;
    this.recentEvents[0] = event;
    return { ok: true, message: event.message, events: result.events };
  }

  sub(user: string, tier = "1000"): MutationResult {
    const type: PlaceableType = Math.random() < 0.5 ? "house" : "shop";
    const result = this.place(type, user);
    if (!result.ok) return result;
    const event: TownEvent = {
      ...result.events[0]!,
      kind: "sub",
      message: `${user} sub (tier ${tier}) — ${type === "shop" ? "une boutique" : "une maison"} apparaît !`,
    };
    result.events[0] = event;
    this.lastEvent = event;
    this.recentEvents[0] = event;
    return { ok: true, message: event.message, events: result.events };
  }

  bits(user: string, amount: number): MutationResult {
    const safeAmount = Math.max(1, Math.floor(amount));
    const now = Date.now();
    this.lastTip = { user, amount: safeAmount, at: now };
    const event: TownEvent = {
      id: id(),
      kind: "bits",
      user,
      amount: safeAmount,
      message: `${user} envoie ${safeAmount} bits !`,
      at: now,
    };
    this.pushEvent(event);
    return {
      ok: true,
      message: event.message,
      events: [event],
      flash: true,
      bitsAmount: safeAmount,
    };
  }

  private maybeFinishUnlock(user: string): TownEvent[] {
    if (this.goal.unlocked || this.goal.current < this.goal.target) return [];
    return this.unlockMetro(user);
  }

  private unlockMetro(user: string): TownEvent[] {
    this.goal.unlocked = true;
    const cx = Math.floor(this.width / 2);
    const cy = Math.floor(this.height / 2);
    const spots = [
      [cx, cy],
      [cx + 1, cy],
      [cx, cy + 1],
      [cx + 1, cy + 1],
    ];
    for (const [x, y] of spots) {
      if (!this.inBounds(x, y)) continue;
      this.tiles[this.idx(x, y)] = {
        type: "metro",
        builder: user,
        builtAt: Date.now(),
        protected: true,
      };
    }
    const event: TownEvent = {
      id: id(),
      kind: "goal",
      user,
      message: `Objectif atteint — le ${this.goal.name} est débloqué !`,
      at: Date.now(),
      x: cx,
      y: cy,
    };
    return [event];
  }
}
