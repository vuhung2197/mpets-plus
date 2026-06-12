import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

export type SessionPhase = "focus" | "shortBreak" | "longBreak";

export interface SessionRecord {
  ts: number;       // Unix ms — when the session completed
  phase: SessionPhase;
  minutes: number;  // actual duration
}

function historyPath(): string {
  return path.join(app.getPath("userData"), "sessions.json");
}

function readAll(): SessionRecord[] {
  try {
    const raw = fs.readFileSync(historyPath(), "utf-8");
    return JSON.parse(raw) as SessionRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: SessionRecord[]): void {
  fs.writeFileSync(historyPath(), JSON.stringify(records), "utf-8");
}

export function addSession(phase: SessionPhase, minutes: number): void {
  const records = readAll();
  records.push({ ts: Date.now(), phase, minutes });
  // keep last 365 days only
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  writeAll(records.filter(r => r.ts >= cutoff));
}

export function getSessions(): SessionRecord[] {
  return readAll();
}

export function clearSessions(): void {
  writeAll([]);
}
