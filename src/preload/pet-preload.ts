import { contextBridge, ipcRenderer } from "electron";

type PetState = "idle" | "work" | "break" | "celebrate" | "sleepy";
interface Sprite { mood: PetState; frame0: string; frame1: string; }
interface Motion { facing: "left" | "right"; walking: boolean; x: number; }

const api = {
  onSprite: (cb: (sprite: Sprite) => void): void => {
    ipcRenderer.on("pet:sprite", (_e, sprite) => cb(sprite));
  },
  onMotion: (cb: (motion: Motion) => void): void => {
    ipcRenderer.on("pet:motion", (_e, motion) => cb(motion));
  },
  onBackground: (cb: (show: boolean) => void): void => {
    ipcRenderer.on("pet:background", (_e, show) => cb(show));
  },
  onTimer: (cb: (text: string) => void): void => {
    ipcRenderer.on("pet:timer", (_e, text) => cb(text));
  },
  activate: (): void => {
    ipcRenderer.invoke("menubar-pet:activate");
  },
};

contextBridge.exposeInMainWorld("desktopPet", api);

export type DesktopPetAPI = typeof api;
