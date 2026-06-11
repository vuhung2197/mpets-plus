// Renderer logic. Talks to the main process only through window.petAPI.
type PomodoroPhase = "focus" | "shortBreak" | "longBreak";
interface PomodoroState {
  phase: PomodoroPhase;
  remaining: number;
  running: boolean;
  completedFocus: number;
}

interface PomoDurations { focus: number; shortBreak: number; longBreak: number; }

interface PetAPI {
  pomodoro: {
    get(): Promise<PomodoroState>;
    start(): Promise<void>;
    pause(): Promise<void>;
    reset(): Promise<void>;
    skip(): Promise<void>;
    onUpdate(cb: (state: PomodoroState) => void): void;
    getDurations(): Promise<PomoDurations>;
    setDuration(phase: PomodoroPhase, minutes: number): Promise<{ ok: boolean }>;
    onDurationsChanged(cb: (d: PomoDurations) => void): void;
  };
  chat: {
    send(text: string): void;
    reset(): Promise<void>;
    onToken(cb: (text: string) => void): void;
    onDone(cb: () => void): void;
    onError(cb: (message: string) => void): void;
  };
  app: {
    quit(): Promise<void>;
  };
  settings: {
    getStatus(): Promise<{ hasKey: boolean }>;
    setKey(key: string): Promise<{ ok: boolean }>;
    getSkin(): Promise<string>;
    setSkin(skin: string): Promise<{ ok: boolean }>;
    getBackground(): Promise<boolean>;
    setBackground(show: boolean): Promise<{ ok: boolean }>;
  };
}

declare const petAPI: PetAPI;
const api = petAPI;
const $ = (id: string) => document.getElementById(id)!;

// --- Tabs ------------------------------------------------------------------
document.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab!;
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`.view[data-view="${target}"]`)!.classList.add("active");
    if (target === "chat") $("chatInput").focus();
  });
});

// --- Pomodoro --------------------------------------------------------------
const phaseEl = $("phase");
const clockEl = $("clock");
const sessionsEl = $("sessions");
const startPauseBtn = $("startPause") as HTMLButtonElement;

const PHASE_LABELS: Record<PomodoroPhase, string> = {
  focus: "Tập trung",
  shortBreak: "Nghỉ ngắn",
  longBreak: "Nghỉ dài",
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function renderPomodoro(state: PomodoroState): void {
  phaseEl.textContent = PHASE_LABELS[state.phase];
  clockEl.textContent = formatTime(state.remaining);
  sessionsEl.textContent = `${state.completedFocus} phiên hoàn thành`;
  startPauseBtn.textContent = state.running ? "Tạm dừng" : "Bắt đầu";
}

startPauseBtn.addEventListener("click", async () => {
  const state = await api.pomodoro.get();
  if (state.running) await api.pomodoro.pause();
  else await api.pomodoro.start();
});
$("reset").addEventListener("click", () => api.pomodoro.reset());
$("skip").addEventListener("click", () => api.pomodoro.skip());

api.pomodoro.onUpdate(renderPomodoro);
api.pomodoro.get().then(renderPomodoro);

// --- Chat ------------------------------------------------------------------
const messagesEl = $("messages");
const composer = $("composer") as HTMLFormElement;
const chatInput = $("chatInput") as HTMLInputElement;
const sendBtn = $("sendBtn") as HTMLButtonElement;

let streamingBubble: HTMLDivElement | null = null;

function addBubble(text: string, cls: "user" | "pet" | "error"): HTMLDivElement {
  const div = document.createElement("div");
  div.className = `bubble ${cls}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function setSending(sending: boolean): void {
  sendBtn.disabled = sending;
  chatInput.disabled = sending;
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  addBubble(text, "user");
  chatInput.value = "";
  setSending(true);
  streamingBubble = addBubble("", "pet");
  api.chat.send(text);
});

api.chat.onToken((token) => {
  if (!streamingBubble) streamingBubble = addBubble("", "pet");
  streamingBubble.textContent += token;
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

api.chat.onDone(() => {
  streamingBubble = null;
  setSending(false);
  chatInput.focus();
});

api.chat.onError((message) => {
  if (streamingBubble && !streamingBubble.textContent) {
    streamingBubble.className = "bubble error";
    streamingBubble.textContent = `⚠️ ${message}`;
  } else {
    addBubble(`⚠️ ${message}`, "error");
  }
  streamingBubble = null;
  setSending(false);
});

$("resetChat").addEventListener("click", () => {
  api.chat.reset();
  messagesEl.innerHTML = "";
});

// --- Settings --------------------------------------------------------------
const apiKeyInput = $("apiKey") as HTMLInputElement;
const keyStatus = $("keyStatus");

function refreshKeyStatus(): void {
  api.settings.getStatus().then(({ hasKey }) => {
    keyStatus.textContent = hasKey
      ? "✅ Đã cấu hình key."
      : "Chưa có key — Pixel chưa thể chat cho đến khi bạn thêm vào.";
  });
}

$("saveKey").addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  await api.settings.setKey(key);
  apiKeyInput.value = "";
  refreshKeyStatus();
});

// Skin
const skinSelect = $("skin") as HTMLSelectElement;
api.settings.getSkin().then((skin) => { skinSelect.value = skin; });
skinSelect.addEventListener("change", () => api.settings.setSkin(skinSelect.value));

// Pet background toggle
const petBgToggle = $("petBackground") as HTMLInputElement;
api.settings.getBackground().then((show) => { petBgToggle.checked = show; });
petBgToggle.addEventListener("change", () => api.settings.setBackground(petBgToggle.checked));

// Duration inputs
const durationFocus = $("durationFocus") as HTMLInputElement;
const durationShort = $("durationShort") as HTMLInputElement;
const durationLong  = $("durationLong")  as HTMLInputElement;

function applyDurations(d: PomoDurations): void {
  durationFocus.value = String(d.focus);
  durationShort.value = String(d.shortBreak);
  durationLong.value  = String(d.longBreak);
}

api.pomodoro.getDurations().then(applyDurations);
api.pomodoro.onDurationsChanged(applyDurations); // refresh when chat changes them

$("saveDurations").addEventListener("click", async () => {
  const focus      = Math.max(1, Math.min(120, parseInt(durationFocus.value) || 25));
  const shortBreak = Math.max(1, Math.min(60,  parseInt(durationShort.value) || 5));
  const longBreak  = Math.max(1, Math.min(120, parseInt(durationLong.value)  || 15));
  await api.pomodoro.setDuration("focus",      focus);
  await api.pomodoro.setDuration("shortBreak", shortBreak);
  await api.pomodoro.setDuration("longBreak",  longBreak);
  // clamp inputs to accepted values
  durationFocus.value = String(focus);
  durationShort.value = String(shortBreak);
  durationLong.value  = String(longBreak);
});

refreshKeyStatus();

// --- Quit ------------------------------------------------------------------
// Use mousedown so the IPC fires before the blur→hide sequence on macOS.
$("quitApp").addEventListener("mousedown", () => api.app.quit());
