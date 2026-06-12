// Bridges the renderer to the main process over a small, typed API surface.
import { contextBridge, ipcRenderer } from "electron";

type PomodoroPhase = "focus" | "shortBreak" | "longBreak";
interface PomodoroState {
  phase: PomodoroPhase;
  remaining: number;
  running: boolean;
  completedFocus: number;
}
interface PomoDurations { focus: number; shortBreak: number; longBreak: number; }

const api = {
  pomodoro: {
    get: (): Promise<PomodoroState> => ipcRenderer.invoke("pomodoro:get"),
    start: (): Promise<void> => ipcRenderer.invoke("pomodoro:start"),
    pause: (): Promise<void> => ipcRenderer.invoke("pomodoro:pause"),
    reset: (): Promise<void> => ipcRenderer.invoke("pomodoro:reset"),
    skip: (): Promise<void> => ipcRenderer.invoke("pomodoro:skip"),
    onUpdate: (cb: (state: PomodoroState) => void): void => {
      ipcRenderer.on("pomodoro:update", (_e, state) => cb(state));
    },
    getDurations: (): Promise<PomoDurations> =>
      ipcRenderer.invoke("pomodoro:getDurations"),
    setDuration: (phase: PomodoroPhase, minutes: number): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke("pomodoro:setDuration", phase, minutes),
    onDurationsChanged: (cb: (d: PomoDurations) => void): void => {
      ipcRenderer.on("pomodoro:durationsChanged", (_e, d) => cb(d));
    },
  },
  chat: {
    send: (text: string): void => ipcRenderer.send("chat:send", text),
    reset: (): Promise<void> => ipcRenderer.invoke("chat:reset"),
    onToken: (cb: (text: string) => void): void => {
      ipcRenderer.on("chat:token", (_e, text) => cb(text));
    },
    onDone: (cb: () => void): void => {
      ipcRenderer.on("chat:done", () => cb());
    },
    onError: (cb: (message: string) => void): void => {
      ipcRenderer.on("chat:error", (_e, message) => cb(message));
    },
  },
  app: {
    quit: (): void => ipcRenderer.send("app:quit"),
  },
  settings: {
    getStatus: (): Promise<{ hasKey: boolean }> =>
      ipcRenderer.invoke("settings:getStatus"),
    setKey: (key: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke("settings:setKey", key),
    getSkin: (): Promise<string> => ipcRenderer.invoke("settings:getSkin"),
    setSkin: (skin: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke("settings:setSkin", skin),
    getColor: (): Promise<string> => ipcRenderer.invoke("settings:getColor"),
    setColor: (color: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke("settings:setColor", color),
    getBackground: (): Promise<boolean> =>
      ipcRenderer.invoke("settings:getBackground"),
    setBackground: (show: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke("settings:setBackground", show),
    getBgColor: (): Promise<string> => ipcRenderer.invoke("settings:getBgColor"),
    setBgColor: (color: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke("settings:setBgColor", color),
  },
};

contextBridge.exposeInMainWorld("petAPI", api);

export type PetAPI = typeof api;
