export const TILE_TYPES = [
  "empty",
  "tree",
  "road",
  "park",
  "house",
  "shop",
  "metro",
] as const;

export type TileType = (typeof TILE_TYPES)[number];

export type PlaceableType = "tree" | "road" | "park" | "house" | "shop" | "metro";

export interface Tile {
  type: TileType;
  builder: string | null;
  builtAt: number | null;
  protected: boolean;
}

export interface LastTip {
  user: string;
  amount: number;
  at: number;
}

export interface TownEvent {
  id: string;
  kind: "build" | "road" | "park" | "demolish" | "vote" | "follow" | "sub" | "bits" | "goal";
  user: string;
  message: string;
  at: number;
  x?: number;
  y?: number;
  amount?: number;
}

export interface GoalState {
  name: string;
  reward: string;
  target: number;
  votes: number;
  houseCount: number;
  current: number;
  unlocked: boolean;
}

export interface WorldSnapshot {
  width: number;
  height: number;
  tiles: Tile[];
  goal: GoalState;
  lastTip: LastTip | null;
  lastEvent: TownEvent | null;
  recentEvents: TownEvent[];
  stats: Record<TileType, number>;
}

export type ChatCommandName = "build" | "road" | "park" | "demolish" | "vote";

export interface ParsedCommand {
  name: ChatCommandName;
  x?: number;
  y?: number;
}

export type MutationResult =
  | { ok: true; message: string; events: TownEvent[]; flash?: boolean; bitsAmount?: number }
  | { ok: false; message: string };

export type ClientMessage =
  | { type: "state"; payload: WorldSnapshot }
  | { type: "event"; payload: TownEvent }
  | { type: "flash"; payload: { user: string; amount: number } }
  | { type: "pong" };
