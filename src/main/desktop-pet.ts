// The on-screen desktop pet: a small transparent, always-on-top window that
// wanders along the bottom of the screen. main.ts drives its mood; the walk
// loop lives here (it owns the OS window position). The renderer (pet.ts)
// handles the lively per-frame animation (bob / hop / blink / flip).
import { BrowserWindow, screen } from "electron";
import * as fs from "fs";
import * as path from "path";
import { PetState, Skin } from "./tray";

const WIN_W = 96;
const WIN_H = 96;
const STEP = 1.4; // px per tick while walking
const TICK_MS = 40; // ~25 fps
const MOVING_MOODS: PetState[] = ["idle", "work", "break"];

function dataUrl(file: string): string {
  return `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
}

export class DesktopPet {
  private win: BrowserWindow;
  private assetsDir: string;
  private skin: Skin;
  private mood: PetState = "idle";

  private x = 0; // float window x, synced from the OS each tick
  private target = 0;
  private facing: "left" | "right" = "right";
  private walking = false;
  private walkTimer: NodeJS.Timeout | null = null;
  private wanderTimeout: NodeJS.Timeout | null = null;
  private ready = false;

  constructor(assetsDir: string, skin: Skin) {
    this.assetsDir = assetsDir;
    this.skin = skin;

    this.win = new BrowserWindow({
      width: WIN_W,
      height: WIN_H,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      fullscreenable: false,
      focusable: false, // never steal focus
      webPreferences: {
        preload: path.join(__dirname, "..", "preload", "pet-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.win.setAlwaysOnTop(true, "screen-saver");
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadFile(path.join(__dirname, "..", "renderer", "pet.html"));

    this.win.webContents.on("did-finish-load", () => {
      this.ready = true;
      this.placeOnFloor();
      this.pushSprite();
      this.pushMotion();
      this.maybeWander();
    });

    this.walkTimer = setInterval(() => this.tick(), TICK_MS);
  }

  private floor(): { x0: number; x1: number; y: number } {
    const area = screen.getPrimaryDisplay().workArea;
    return {
      x0: area.x,
      x1: area.x + area.width - WIN_W,
      y: area.y + area.height - WIN_H,
    };
  }

  private placeOnFloor(): void {
    const f = this.floor();
    this.x = Math.round((f.x0 + f.x1) / 2);
    this.win.setPosition(this.x, f.y, false);
  }

  private spriteFiles(state: PetState): [string, string] {
    const dir = path.join(this.assetsDir, "pet", this.skin);
    return [path.join(dir, `${state}-0.png`), path.join(dir, `${state}-1.png`)];
  }

  private pushSprite(): void {
    if (!this.ready) return;
    const [f0, f1] = this.spriteFiles(this.mood);
    this.win.webContents.send("pet:sprite", {
      mood: this.mood,
      frame0: dataUrl(f0),
      frame1: dataUrl(f1),
    });
  }

  private pushMotion(): void {
    if (!this.ready) return;
    this.win.webContents.send("pet:motion", {
      facing: this.facing,
      walking: this.walking,
    });
  }

  /** Schedules the next stroll, if the current mood allows moving. */
  private maybeWander(): void {
    if (this.wanderTimeout) {
      clearTimeout(this.wanderTimeout);
      this.wanderTimeout = null;
    }
    if (!MOVING_MOODS.includes(this.mood)) return;
    const delay = 2000 + Math.floor(this.pseudoRandom() * 4000);
    this.wanderTimeout = setTimeout(() => this.startWalk(), delay);
  }

  // Deterministic-ish jitter without Math.random (kept simple + lint-friendly).
  private seed = 1;
  private pseudoRandom(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  private startWalk(): void {
    if (!MOVING_MOODS.includes(this.mood)) return;
    const f = this.floor();
    this.target = f.x0 + Math.floor(this.pseudoRandom() * (f.x1 - f.x0));
    const newFacing = this.target < this.x ? "left" : "right";
    this.facing = newFacing;
    this.walking = true;
    this.pushMotion();
  }

  private tick(): void {
    if (!this.ready || this.win.isDestroyed() || !this.win.isVisible()) return;

    // Sync with the OS position so the user can drag the pet around.
    const [curX, curY] = this.win.getPosition();
    this.x = curX;

    if (!this.walking) return;

    const dx = this.target - this.x;
    if (Math.abs(dx) <= STEP) {
      this.x = this.target;
      this.walking = false;
      this.pushMotion();
      this.maybeWander();
    } else {
      this.x += Math.sign(dx) * STEP;
    }
    this.win.setPosition(Math.round(this.x), curY, false);
  }

  setMood(state: PetState): void {
    if (this.mood === state) return;
    this.mood = state;
    if (!MOVING_MOODS.includes(state)) {
      this.walking = false;
      this.pushMotion();
    }
    this.pushSprite();
    this.maybeWander();
  }

  setSkin(skin: Skin): void {
    this.skin = skin;
    this.pushSprite();
  }

  setVisible(visible: boolean): void {
    if (visible) {
      this.placeOnFloor();
      this.win.showInactive(); // show without stealing focus
      this.maybeWander();
    } else {
      this.win.hide();
    }
  }

  destroy(): void {
    if (this.walkTimer) clearInterval(this.walkTimer);
    if (this.wanderTimeout) clearTimeout(this.wanderTimeout);
    if (!this.win.isDestroyed()) this.win.destroy();
  }
}
