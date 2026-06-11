# Mac Pet Plus

A pixel pet that lives in your macOS menu bar — like Mac Pet, with more to it. **Phase 1** ships three features:

- 🐾 **Pixel pet on the menu bar** — an animated pixel-art tray icon that changes mood and shows the live timer.
- 🍅 **Pomodoro timer** — 25-min focus / 5-min short break / 15-min long break, with a long break every 4 focus sessions. Notifications on each phase change.
- 💬 **Chat with your pet** — talk to Pixel, powered by the OpenAI API (`gpt-4o-mini`, streaming).

**Phase 2** adds life to the pet:

- 🎭 **Reactions** — the pet has five moods: idle, focused (during work), resting (during breaks), **celebrating** (after a focus session completes, ~5s), and **sleepy** (dozes off after 5 min with no timer running; wakes when you open the popover).
- 🎨 **Skins** — choose between **Cat**, **Blob**, and **Ghost** in the Settings tab. The choice persists.

## Stack

Electron + TypeScript. No bundler — `tsc` compiles to `dist/` and a small script copies the renderer HTML/CSS.

## Project structure

```
src/
  main/          Electron main process
    main.ts        app entry — tray, popover window, IPC wiring
    tray.ts        animated pixel-pet tray icon + timer title
    pomodoro.ts    Pomodoro timer state machine
    chat.ts        streaming chat via the openai SDK
    settings.ts    API key persistence (userData/config.json)
  preload/
    preload.ts     contextBridge — the typed window.petAPI surface
  renderer/
    index.html     popover UI (Timer / Chat / Settings tabs)
    styles.css
    renderer.ts
scripts/
  generate-assets.js  generates pixel-pet PNG frames per skin/state (self-contained encoder)
  copy-static.js      copies renderer HTML/CSS into dist/
assets/pet/<skin>/    generated tray icon frames (<state>-<frame>.png)
```

## Setup

```bash
npm install
npm run generate-assets   # creates assets/pet/*.png (run once)
npm start                 # builds and launches the app
```

The pet appears in your menu bar (the app has no Dock icon). **Left-click** the pet to open the popover; **right-click** for Quit.

## API key

Chat needs an OpenAI API key. Either:

- Open the popover → **Settings** tab → paste your key → Save, or
- Set `OPENAI_API_KEY` in your environment (see `.env.example`).

The key is stored locally in the app's `userData/config.json`.

## Roadmap

- Phase 1 ✅ — menu-bar pet, Pomodoro, chat.
- Phase 2 ✅ — pet reactions (celebrate / sleepy) and selectable skins.
- Future ideas: Pomodoro stats & history, custom timer durations, sound alerts, draggable desktop pet, more skins.
