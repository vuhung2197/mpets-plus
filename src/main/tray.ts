import { Tray, Menu, nativeImage } from "electron";

export type PetState = "idle" | "work" | "break" | "celebrate" | "sleepy";
export const SKINS = ["cat", "blob", "ghost"] as const;
export type Skin = (typeof SKINS)[number];

export const COLORS = ["default", "pink", "purple", "mint", "dark"] as const;
export type Color = (typeof COLORS)[number];

function makeDotIcon(): Electron.NativeImage {
  // 32x32 buffer at scaleFactor 2 → logical 16x16, soft white circle (template)
  const S = 32;
  const cx = S / 2, cy = S / 2, r = 6;
  const data = Buffer.alloc(S * S * 4, 0);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d <= r) {
        const i = (y * S + x) * 4;
        const a = Math.round((1 - d / r) * 200 + 55);
        data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = a;
      }
    }
  }
  const img = nativeImage.createFromBitmap(data, { width: S, height: S, scaleFactor: 2 });
  img.setTemplateImage(true);
  return img;
}

export class PetTray {
  private tray: Tray;

  constructor(onClick: () => void, onQuit?: () => void) {
    this.tray = new Tray(makeDotIcon());
    this.tray.setToolTip("Mac Pet Plus");
    this.tray.on("click", onClick);

    const menu = Menu.buildFromTemplate([
      { label: "Mở", click: onClick },
      { type: "separator" },
      { label: "Thoát", click: () => onQuit?.() },
    ]);
    this.tray.on("right-click", () => this.tray.popUpContextMenu(menu));
  }

  setTitle(text: string): void {
    this.tray.setTitle(text ? ` ${text}` : "");
  }

  getBounds(): Electron.Rectangle {
    return this.tray.getBounds();
  }

  destroy(): void {
    this.tray.destroy();
  }
}
