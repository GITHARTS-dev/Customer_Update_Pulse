import "server-only";
import fs from "fs/promises";
import path from "path";

const STORE_PATH = path.join(process.cwd(), "data", "ceo-log.json");

export type ActionStatus = "noted" | "done" | "dismissed";

export interface ActionState {
  status: ActionStatus;
  at: string;
}

export interface CeoLog {
  actions: Record<string, ActionState>;
  views: Record<string, string>;
}

async function ensureLog(): Promise<CeoLog> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    return JSON.parse(raw) as CeoLog;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const empty: CeoLog = { actions: {}, views: {} };
      await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
      await fs.writeFile(STORE_PATH, JSON.stringify(empty, null, 2), "utf-8");
      return empty;
    }
    throw err;
  }
}

export async function readCeoLog(): Promise<CeoLog> {
  return ensureLog();
}

export async function setAction(
  key: string,
  status: ActionStatus | "open"
): Promise<void> {
  const log = await ensureLog();
  if (status === "open") {
    delete log.actions[key];
  } else {
    log.actions[key] = { status, at: new Date().toISOString() };
  }
  await fs.writeFile(STORE_PATH, JSON.stringify(log, null, 2), "utf-8");
}

export async function setView(programmeId: string): Promise<void> {
  const log = await ensureLog();
  log.views[programmeId] = new Date().toISOString();
  await fs.writeFile(STORE_PATH, JSON.stringify(log, null, 2), "utf-8");
}
