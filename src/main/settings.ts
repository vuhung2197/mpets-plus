import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { SKINS, Skin } from "./tray";
import { PomoDurations } from "./pomodoro";

interface Config {
  apiKey?: string;
  skin?: string;
  pomoDurations?: PomoDurations;
  showPetBackground?: boolean;
}

function configPath(): string {
  return path.join(app.getPath("userData"), "config.json");
}

function read(): Config {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf-8")) as Config;
  } catch {
    return {};
  }
}

function write(config: Config): void {
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf-8");
}

export function getApiKey(): string | undefined {
  return read().apiKey || process.env.OPENAI_API_KEY || undefined;
}

export function setApiKey(key: string): void {
  const c = read();
  c.apiKey = key.trim() || undefined;
  write(c);
}

export function hasApiKey(): boolean {
  return Boolean(getApiKey());
}

export function getSkin(): Skin {
  const s = read().skin;
  return SKINS.includes(s as Skin) ? (s as Skin) : "cat";
}

export function setSkin(skin: Skin): void {
  const c = read();
  c.skin = skin;
  write(c);
}

export function getPomoDurations(): PomoDurations {
  return read().pomoDurations ?? { focus: 25, shortBreak: 5, longBreak: 15 };
}

export function setPomoDurations(d: PomoDurations): void {
  const c = read();
  c.pomoDurations = d;
  write(c);
}

export function getShowPetBackground(): boolean {
  return read().showPetBackground === true; // default: off
}

export function setShowPetBackground(show: boolean): void {
  const c = read();
  c.showPetBackground = show;
  write(c);
}
