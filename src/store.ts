import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { WorldSnapshot } from "./types.js";

export async function loadSnapshot(): Promise<WorldSnapshot | null> {
  try {
    const raw = await readFile(config.dataFile, "utf8");
    const parsed = JSON.parse(raw) as WorldSnapshot;
    if (!parsed || !Array.isArray(parsed.tiles)) return null;
    return parsed;
  } catch {
    return null;
  }
}

let writeChain: Promise<void> = Promise.resolve();

export async function saveSnapshot(snapshot: WorldSnapshot): Promise<void> {
  const pending = writeChain.then(() => writeSnapshotFile(snapshot));
  writeChain = pending.catch(() => undefined);
  return pending;
}

async function writeSnapshotFile(snapshot: WorldSnapshot): Promise<void> {
  await mkdir(path.dirname(config.dataFile), { recursive: true });
  const tmp = `${config.dataFile}.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(16).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(snapshot), "utf8");
  await rename(tmp, config.dataFile);
}
