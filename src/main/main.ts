import { app, BrowserWindow, ipcMain, Menu, screen, Notification, dialog } from "electron";
import * as path from "path";
import { autoUpdater } from "electron-updater";
import { PetState, Skin, Color } from "./tray";
import { MenuBarPet } from "./menubar-pet";
import { Pomodoro, PomodoroState, formatTime } from "./pomodoro";
import { streamChat, resetConversation, TimerControls } from "./chat";
import {
  getApiKey, setApiKey, hasApiKey,
  getSkin, setSkin,
  getColor, setColor,
  getBgColor, setBgColor,
  getPomoDurations, setPomoDurations,
  getShowPetBackground, setShowPetBackground,
} from "./settings";

// dist/main -> project root -> assets
const ASSETS_DIR = path.join(__dirname, "..", "..", "assets");
const WINDOW_WIDTH = 340;
const WINDOW_HEIGHT = 480;
const IDLE_SLEEP_MS = 5 * 60 * 1000; // pet dozes off after 5 min of no timer

let menuBarPet: MenuBarPet | null = null;
let win: BrowserWindow | null = null;
let idleTimer: NodeJS.Timeout | null = null;
const pomodoro = new Pomodoro(getPomoDurations());

// --- Mood orchestration: keeps the tray and desktop pet in sync -------------
let baseMood: PetState = "idle"; // persistent mood (driven by Pomodoro / idle)
let reactionTimer: NodeJS.Timeout | null = null; // active transient reaction

function renderMood(state: PetState): void {
  menuBarPet?.setMood(state);
}

/** Sets the persistent mood; yields to an active reaction if one is playing. */
function setBaseMood(state: PetState): void {
  baseMood = state;
  if (!reactionTimer) renderMood(state);
}

/** Plays a transient reaction (e.g. celebrate), then reverts to baseMood. */
function playReaction(state: PetState, durationMs: number): void {
  if (reactionTimer) clearTimeout(reactionTimer);
  renderMood(state);
  reactionTimer = setTimeout(() => {
    reactionTimer = null;
    renderMood(baseMood);
  }, durationMs);
}

function clearIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleSleep(): void {
  clearIdleTimer();
  idleTimer = setTimeout(() => setBaseMood("sleepy"), IDLE_SLEEP_MS);
}

/** Wakes the pet to idle and restarts the doze countdown (on user activity). */
function wake(): void {
  if (!pomodoro.getState().running) {
    setBaseMood("idle");
    scheduleSleep();
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  // Popover behavior: hide when it loses focus.
  window.on("blur", () => {
    if (!window.webContents.isDevToolsOpened()) window.hide();
  });

  return window;
}

/**
 * Positions the popover centered directly below the pet background strip.
 * Works correctly on any display (notch or non-notch) — the strip bounds
 * come from the MenuBarPet window itself so there is no coordinate mismatch.
 */
function showWindowBelowPet(): void {
  if (!win || !menuBarPet) return;
  const strip = menuBarPet.getBounds();
  const display = screen.getDisplayNearestPoint({ x: strip.x, y: strip.y });

  // Centre the popup horizontally under the strip.
  let x = Math.round(strip.x + strip.width / 2 - WINDOW_WIDTH / 2);
  const y = strip.y + strip.height + 4;

  // Clamp so the popup never overflows the display work area.
  const work = display.workArea;
  x = Math.max(work.x + 4, Math.min(x, work.x + work.width - WINDOW_WIDTH - 4));

  win.setPosition(x, y, false);
  win.show();
  win.focus();
}

function toggleWindow(): void {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.webContents.send("pomodoro:update", pomodoro.getState());
    showWindowBelowPet();
    wake(); // opening the popover counts as activity
  }
}

/** Maps a running Pomodoro phase to the pet's working mood. */
function runningStateFor(state: PomodoroState): PetState {
  return state.phase === "focus" ? "work" : "break";
}

function pushPomodoroUpdate(state: PomodoroState): void {
  if (state.running) {
    clearIdleTimer();
    setBaseMood(runningStateFor(state));
  } else {
    setBaseMood("idle");
    scheduleSleep(); // start the doze countdown while paused/idle
  }
  menuBarPet?.setTimer(state.running ? formatTime(state.remaining) : "");
  win?.webContents.send("pomodoro:update", state);
}

function registerIpc(): void {
  ipcMain.handle("pomodoro:get", () => pomodoro.getState());
  ipcMain.handle("pomodoro:start", () => pomodoro.start());
  ipcMain.handle("pomodoro:pause", () => pomodoro.pause());
  ipcMain.handle("pomodoro:reset", () => pomodoro.reset());
  ipcMain.handle("pomodoro:skip", () => pomodoro.skip());
  ipcMain.handle("pomodoro:getDurations", () => pomodoro.getDurations());
  ipcMain.handle("pomodoro:setDuration", (_e, phase: string, minutes: number) => {
    pomodoro.setDuration(phase as Parameters<typeof pomodoro.setDuration>[0], minutes);
    setPomoDurations(pomodoro.getDurations());
    return { ok: true };
  });

  ipcMain.handle("settings:getStatus", () => ({ hasKey: hasApiKey() }));
  ipcMain.handle("settings:setKey", (_e, key: string) => {
    setApiKey(key);
    return { ok: true };
  });

  ipcMain.handle("settings:getSkin", () => getSkin());
  ipcMain.handle("settings:setSkin", (_e, skin: Skin) => {
    setSkin(skin);
    menuBarPet?.setSkin(skin);
    return { ok: true };
  });

  ipcMain.handle("settings:getColor", () => getColor());
  ipcMain.handle("settings:setColor", (_e, color: Color) => {
    setColor(color);
    menuBarPet?.setColor(color);
    return { ok: true };
  });

  ipcMain.handle("settings:getBackground", () => getShowPetBackground());
  ipcMain.handle("settings:setBackground", (_e, show: boolean) => {
    setShowPetBackground(show);
    menuBarPet?.setBackground(show);
    return { ok: true };
  });

  ipcMain.handle("settings:getBgColor", () => getBgColor());
  ipcMain.handle("settings:setBgColor", (_e, color: string) => {
    setBgColor(color);
    menuBarPet?.setBgColor(color);
    return { ok: true };
  });

  // Fire-and-forget: use ipcMain.on so quit isn't blocked waiting for a response
  // that may never arrive after windows start closing.
  ipcMain.on("app:quit", () => { app.quit(); });

  // Right-click on the pet strip → context menu with Quit
  ipcMain.on("pet:context-menu", () => {
    Menu.buildFromTemplate([
      { label: "Mở Pixel", click: () => toggleWindow() },
      { type: "separator" },
      { label: "Thoát MPets Plus", click: () => app.quit() },
    ]).popup({ window: win ?? undefined });
  });
  ipcMain.handle("chat:reset", () => resetConversation());
  ipcMain.on("chat:send", async (event, text: string) => {
    const sender = event.sender;
    const controls: TimerControls = {
      start: () => pomodoro.start(),
      pause: () => pomodoro.pause(),
      reset: () => pomodoro.reset(),
      skip: () => pomodoro.skip(),
      setDuration: (phase, minutes) => {
        pomodoro.setDuration(phase, minutes);
        setPomoDurations(pomodoro.getDurations());
        // Notify renderer so duration inputs refresh
        win?.webContents.send("pomodoro:durationsChanged", pomodoro.getDurations());
      },
    };
    await streamChat(text, pomodoro.getState(), pomodoro.getDurations(), controls, {
      onToken: (t) => sender.send("chat:token", t),
      onDone: () => sender.send("chat:done"),
      onError: (m) => sender.send("chat:error", m),
    });
  });
}

function setupAutoUpdater(): void {
  // Chỉ chạy auto-update khi app đã được đóng gói (không phải dev mode)
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    new Notification({
      title: "MPets Plus có bản cập nhật mới!",
      body: `Phiên bản ${info.version} đang được tải về...`,
    }).show();
  });

  autoUpdater.on("update-downloaded", () => {
    const response = dialog.showMessageBoxSync({
      type: "info",
      title: "Cập nhật sẵn sàng",
      message: "Đã tải về bản cập nhật mới. Khởi động lại để cài đặt?",
      buttons: ["Khởi động lại ngay", "Để sau"],
      defaultId: 0,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  // Kiểm tra update sau 3 giây để app khởi động xong
  setTimeout(() => autoUpdater.checkForUpdates(), 3000);
}

app.whenReady().then(() => {
  // Menu-bar-only app: no Dock icon.
  app.dock?.hide();

  void getApiKey(); // touch settings early so userData path is ready

  registerIpc();
  win = createWindow();
  menuBarPet = new MenuBarPet(ASSETS_DIR, getSkin(), getColor(), toggleWindow);
  menuBarPet.setBackground(getShowPetBackground());
  menuBarPet.setBgColor(getBgColor());

  setupAutoUpdater();

  pomodoro.on("update", pushPomodoroUpdate);
  pomodoro.on("phase-complete", (finished: string) => {
    const body =
      finished === "focus"
        ? "Xong rồi! Nghỉ ngơi chút nào 🎉"
        : "Hết giờ nghỉ rồi — vào việc thôi! 💪";
    new Notification({ title: "Pixel", body }).show();
    // Celebrate a finished focus session, then settle back into the next mood.
    if (finished === "focus") playReaction("celebrate", 5000);
  });

  pushPomodoroUpdate(pomodoro.getState());
});

// Keep running as a menu-bar app even with no windows open.
app.on("window-all-closed", () => {
  // no-op on macOS menu-bar apps
});

app.on("before-quit", () => {
  menuBarPet?.destroy();
});
