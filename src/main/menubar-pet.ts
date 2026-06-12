import { BrowserWindow, ipcMain, screen } from "electron";
import * as path from "path";
import * as fs from "fs";
import { PetState, Skin, Color } from "./tray";

const WIN_W  = 200;
const WIN_H  = 40;
const SPRITE = 32;
const SPEED  = 1.5;
const TICK   = 40;
const MOVING: PetState[] = ["idle", "work", "break"];

export class MenuBarPet {
  // One BrowserWindow per display, keyed by display.id
  private wins: Map<number, BrowserWindow> = new Map();

  private skin: Skin;
  private color: Color;
  private mood: PetState = "idle";
  private x = (WIN_W - SPRITE) / 2;
  private dir = 1;
  private walking = false;
  private walkTimer: NodeJS.Timeout | null = null;
  private wanderTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private showBackground = false;
  private bgColor = "rgba(0,0,0,0.40)";
  private timerText = "";
  private seed = 12345;

  private readonly onDisplayChange = () => {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.syncDisplays(), 400);
  };

  constructor(
    private assetsDir: string,
    skin: Skin,
    color: Color,
    onActivate: () => void,
  ) {
    this.skin = skin;
    this.color = color;

    ipcMain.removeHandler("menubar-pet:activate");
    ipcMain.handle("menubar-pet:activate", () => onActivate());

    screen.on("display-added",           this.onDisplayChange);
    screen.on("display-removed",         this.onDisplayChange);
    screen.on("display-metrics-changed", this.onDisplayChange);

    // Create one window for every connected display at startup
    for (const d of screen.getAllDisplays()) {
      this.createWindow(d);
    }
  }

  // ── Per-display window management ─────────────────────────────────────────

  private calcWindowPos(d: Electron.Display): { wx: number; wy: number } {
    // macOS: pet sits at the top (under the menu bar via workArea.y)
    // Windows: workArea.y is 0 when taskbar is at bottom, so top of screen is fine
    return {
      wx: Math.round(d.bounds.x + d.bounds.width / 2 - WIN_W / 2),
      wy: d.workArea.y,
    };
  }

  private createWindow(d: Electron.Display): void {
    if (this.wins.has(d.id)) return;
    const { wx, wy } = this.calcWindowPos(d);
    const displayId = d.id; // capture id for async callbacks

    const win = new BrowserWindow({
      width: WIN_W,
      height: WIN_H,
      x: wx,
      y: wy,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      roundedCorners: false,
      webPreferences: {
        preload: path.join(__dirname, "..", "preload", "pet-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // "status" level sits just above normal windows but below system UI.
    // "screen-saver" can misbehave on secondary displays on macOS.
    win.setAlwaysOnTop(true, "status");
    // setVisibleOnAllWorkspaces is macOS/Linux only — no-op guard for Windows
    if (process.platform !== "win32") {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
    // Explicitly set position after creation — macOS sometimes ignores
    // constructor x/y for secondary displays.
    win.setPosition(wx, wy, false);
    win.loadFile(path.join(__dirname, "..", "renderer", "menubar-pet.html"));
    this.wins.set(displayId, win);

    win.webContents.once("did-finish-load", () => {
      // Re-assert position after load: the renderer process starting up can
      // cause the OS to briefly reorder windows, shifting position on
      // secondary displays.
      const live = screen.getAllDisplays().find(disp => disp.id === displayId);
      if (live) {
        const { wx: x, wy: y } = this.calcWindowPos(live);
        win.setPosition(x, y, false);
      }
      // Push current app state
      this.sendTo(win, "pet:sprite",     this.buildSprite());
      this.sendTo(win, "pet:motion",     this.buildMotion());
      this.sendTo(win, "pet:background", { show: this.showBackground, color: this.bgColor });
      this.sendTo(win, "pet:timer",      this.timerText);
      if (!this.walkTimer && !this.wanderTimer) this.scheduleWander();
    });
  }

  /** Reconcile windows with currently connected displays. */
  private syncDisplays(): void {
    const displays = screen.getAllDisplays();
    const liveIds = new Set(displays.map(d => d.id));

    // Destroy windows for disconnected displays
    for (const [id, win] of this.wins) {
      if (!liveIds.has(id)) {
        if (!win.isDestroyed()) win.destroy();
        this.wins.delete(id);
      }
    }

    // Create or reposition windows for current displays
    for (const d of displays) {
      if (!this.wins.has(d.id)) {
        this.createWindow(d);
      } else {
        const win = this.wins.get(d.id)!;
        if (!win.isDestroyed()) {
          const { wx, wy } = this.calcWindowPos(d);
          win.setPosition(wx, wy, false);
        }
      }
    }
  }

  // ── IPC helpers ────────────────────────────────────────────────────────────

  private sendTo(win: BrowserWindow, channel: string, data: unknown): void {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  }

  /** Broadcast a message to every display's window. */
  private broadcast(channel: string, data: unknown): void {
    for (const [, win] of this.wins) this.sendTo(win, channel, data);
  }

  private dataUrl(state: PetState, frame: number): string {
    const file = path.join(this.assetsDir, "pet", this.skin, this.color, `${state}-${frame}.png`);
    try {
      return `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
    } catch { return ""; }
  }

  private buildSprite() {
    return {
      mood:   this.mood,
      frame0: this.dataUrl(this.mood, 0),
      frame1: this.dataUrl(this.mood, 1),
    };
  }

  private buildMotion() {
    return {
      facing:  this.dir === 1 ? "right" : "left",
      walking: this.walking,
      x:       Math.round(this.x),
    };
  }

  private pushSprite():     void { this.broadcast("pet:sprite",     this.buildSprite()); }
  private pushMotion():     void { this.broadcast("pet:motion",     this.buildMotion()); }
  private pushBackground(): void {
    this.broadcast("pet:background", { show: this.showBackground, color: this.bgColor });
  }
  private pushTimer():      void { this.broadcast("pet:timer",      this.timerText); }

  // ── Walk loop ─────────────────────────────────────────────────────────────

  private tick(): void {
    this.x += SPEED * this.dir;
    const max = WIN_W - SPRITE;
    if (this.x >= max) { this.x = max; this.dir = -1; }
    if (this.x <= 0)   { this.x = 0;   this.dir =  1; }
    this.pushMotion();
  }

  private startWalk(): void {
    if (this.walkTimer) clearInterval(this.walkTimer);
    this.walking = true;
    this.dir = this.rand() < 0.5 ? 1 : -1;
    this.pushMotion();
    this.walkTimer = setInterval(() => this.tick(), TICK);
  }

  private stopWalk(): void {
    if (this.walkTimer) { clearInterval(this.walkTimer); this.walkTimer = null; }
    this.walking = false;
    this.pushMotion();
  }

  private scheduleWander(): void {
    if (this.wanderTimer) clearTimeout(this.wanderTimer);
    if (!MOVING.includes(this.mood)) return;
    if (!this.walking) {
      this.startWalk();
      this.wanderTimer = setTimeout(() => {
        this.stopWalk();
        this.scheduleWander();
      }, 2000 + this.rand() * 4000);
    } else {
      this.wanderTimer = setTimeout(() => this.scheduleWander(), 800 + this.rand() * 2500);
    }
  }

  private rand(): number {
    this.seed = ((this.seed * 1664525 + 1013904223) | 0) >>> 0;
    return this.seed / 0xffffffff;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setMood(mood: PetState): void {
    this.mood = mood;
    this.pushSprite();
    if (MOVING.includes(mood)) this.scheduleWander();
    else this.stopWalk();
  }

  setSkin(skin: Skin): void {
    this.skin = skin;
    this.pushSprite();
  }

  setColor(color: Color): void {
    this.color = color;
    this.pushSprite();
  }

  setBackground(show: boolean): void {
    this.showBackground = show;
    this.pushBackground();
  }

  setBgColor(color: string): void {
    this.bgColor = color;
    this.pushBackground();
  }

  setTimer(text: string): void {
    this.timerText = text;
    this.pushTimer();
  }

  /**
   * Returns the bounds of the primary display's pet window.
   * Used to position the popup directly below the strip.
   */
  getBounds(): Electron.Rectangle {
    const primary = screen.getPrimaryDisplay();
    const win = this.wins.get(primary.id);
    if (win && !win.isDestroyed()) return win.getBounds();
    // Fallback to any surviving window
    for (const [, w] of this.wins) {
      if (!w.isDestroyed()) return w.getBounds();
    }
    return { x: 0, y: 0, width: WIN_W, height: WIN_H };
  }

  destroy(): void {
    this.stopWalk();
    if (this.wanderTimer) clearTimeout(this.wanderTimer);
    if (this.syncTimer)   clearTimeout(this.syncTimer);
    screen.removeListener("display-added",           this.onDisplayChange);
    screen.removeListener("display-removed",         this.onDisplayChange);
    screen.removeListener("display-metrics-changed", this.onDisplayChange);
    ipcMain.removeHandler("menubar-pet:activate");
    for (const [, win] of this.wins) {
      if (!win.isDestroyed()) win.destroy();
    }
    this.wins.clear();
  }
}
