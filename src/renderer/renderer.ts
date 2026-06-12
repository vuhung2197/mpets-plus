// Renderer logic. Talks to the main process only through window.petAPI.
// Constants inlined here because the renderer runs in Chromium (no CommonJS require).
const PHASE_LABELS = { focus: "Tập trung", shortBreak: "Nghỉ ngắn", longBreak: "Nghỉ dài" } as const;
const TIMER_ACTIONS = { start: "Bắt đầu", pause: "Tạm dừng" } as const;
const SETTINGS_LABELS = {
  keySet:     "✅ Đã cấu hình key.",
  keyMissing: "Chưa có key — Pixel chưa thể chat cho đến khi bạn thêm vào.",
} as const;
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
    quit(): void;
  };
  settings: {
    getStatus(): Promise<{ hasKey: boolean }>;
    setKey(key: string): Promise<{ ok: boolean }>;
    getSkin(): Promise<string>;
    setSkin(skin: string): Promise<{ ok: boolean }>;
    getColor(): Promise<string>;
    setColor(color: string): Promise<{ ok: boolean }>;
    getBackground(): Promise<boolean>;
    setBackground(show: boolean): Promise<{ ok: boolean }>;
    getBgColor(): Promise<string>;
    setBgColor(color: string): Promise<{ ok: boolean }>;
  };
}

interface SessionRecord { ts: number; phase: string; minutes: number; }
interface HistoryAPI {
  get(): Promise<SessionRecord[]>;
  clear(): Promise<{ ok: boolean }>;
  onNewSession(cb: () => void): void;
}

declare const petAPI: PetAPI & { history: HistoryAPI };
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


function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function renderPomodoro(state: PomodoroState): void {
  phaseEl.textContent = PHASE_LABELS[state.phase];
  clockEl.textContent = formatTime(state.remaining);
  sessionsEl.textContent = `${state.completedFocus} phiên hoàn thành`;
  startPauseBtn.textContent = state.running ? TIMER_ACTIONS.pause : TIMER_ACTIONS.start;
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
    keyStatus.textContent = hasKey ? SETTINGS_LABELS.keySet : SETTINGS_LABELS.keyMissing;
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

// Color swatches
const swatches = document.querySelectorAll<HTMLButtonElement>("#colorSwatches .swatch");

function setActiveColor(color: string): void {
  swatches.forEach(s => s.classList.toggle("active", s.dataset.color === color));
}

api.settings.getColor().then(setActiveColor);

swatches.forEach(swatch => {
  swatch.addEventListener("click", () => {
    const color = swatch.dataset.color!;
    api.settings.setColor(color);
    setActiveColor(color);
  });
});

// Pet background toggle
const petBgToggle = $("petBackground") as HTMLInputElement;
api.settings.getBackground().then((show) => { petBgToggle.checked = show; });
petBgToggle.addEventListener("change", () => api.settings.setBackground(petBgToggle.checked));

// Background color swatches
const bgSwatches = document.querySelectorAll<HTMLButtonElement>("#bgColorSwatches .swatch");

function setActiveBgColor(color: string): void {
  bgSwatches.forEach(s => s.classList.toggle("active", s.dataset.bg === color));
}

api.settings.getBgColor().then(setActiveBgColor);

bgSwatches.forEach(swatch => {
  swatch.addEventListener("click", () => {
    const color = swatch.dataset.bg!;
    api.settings.setBgColor(color);
    setActiveBgColor(color);
    // Bật background nếu đang tắt
    if (!petBgToggle.checked) {
      petBgToggle.checked = true;
      api.settings.setBackground(true);
    }
  });
});

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

// --- History ---------------------------------------------------------------
const PHASE_NAMES: Record<string, string> = {
  focus: "Tập trung",
  shortBreak: "Nghỉ ngắn",
  longBreak: "Nghỉ dài",
};

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function todayKey(): string {
  return dayKey(Date.now());
}

function renderHistory(records: SessionRecord[]): void {
  const focusRecords = records.filter(r => r.phase === "focus");

  // Stats
  const todayFocus = focusRecords.filter(r => dayKey(r.ts) === todayKey());
  ($("statFocusToday") as HTMLElement).textContent = String(todayFocus.length);
  ($("statMinutesToday") as HTMLElement).textContent = String(
    todayFocus.reduce((s, r) => s + r.minutes, 0)
  );

  // Streak: consecutive days with ≥1 focus session ending today or yesterday
  const focusDays = new Set(focusRecords.map(r => dayKey(r.ts)));
  let streak = 0;
  const now = new Date();
  // start from today; if no session today, start from yesterday
  const startOffset = focusDays.has(todayKey()) ? 0 : 1;
  for (let i = startOffset; i < 365; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (focusDays.has(dayKey(d.getTime()))) streak++;
    else break;
  }
  ($("statStreak") as HTMLElement).textContent = String(streak);

  // Heatmap: 35 days, row-major Sun→Sat, oldest first (top-left)
  const heatmap = $("heatmap");
  heatmap.innerHTML = "";
  // count focus sessions per day
  const dayCounts: Record<string, number> = {};
  focusRecords.forEach(r => {
    const k = dayKey(r.ts);
    dayCounts[k] = (dayCounts[k] ?? 0) + 1;
  });

  for (let i = 34; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const k = dayKey(d.getTime());
    const count = dayCounts[k] ?? 0;
    const level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : 3;
    const cell = document.createElement("div");
    cell.className = "heatmap-cell" + (i === 0 ? " today" : "");
    cell.dataset.level = String(level);
    const dateStr = d.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric" });
    cell.title = `${dateStr}: ${count} phiên focus`;
    heatmap.appendChild(cell);
  }

  // Today's session list (all phases, newest first)
  const list = $("sessionList");
  list.innerHTML = "";
  const todayAll = records
    .filter(r => dayKey(r.ts) === todayKey())
    .slice()
    .reverse();

  if (todayAll.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Chưa có phiên nào hôm nay — bắt đầu tập trung thôi! 🍅";
    list.appendChild(empty);
  } else {
    todayAll.forEach(r => {
      const item = document.createElement("div");
      item.className = "session-item";

      const dot = document.createElement("div");
      dot.className = `session-dot ${r.phase}`;

      const timeEl = document.createElement("span");
      timeEl.className = "session-time";
      const d = new Date(r.ts);
      timeEl.textContent = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

      const phaseEl = document.createElement("span");
      phaseEl.className = "session-phase";
      phaseEl.textContent = PHASE_NAMES[r.phase] ?? r.phase;

      const durEl = document.createElement("span");
      durEl.className = "session-duration";
      durEl.textContent = `${r.minutes} phút`;

      item.append(dot, timeEl, phaseEl, durEl);
      list.appendChild(item);
    });
  }
}

async function loadHistory(): Promise<void> {
  const records = await api.history.get();
  renderHistory(records);
}

// Reload when a new session completes
api.history.onNewSession(loadHistory);

// Load when switching to history tab
document.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    if (tab.dataset.tab === "history") loadHistory();
  });
});

$("clearHistory").addEventListener("click", async () => {
  await api.history.clear();
  loadHistory();
});

loadHistory();

// --- Quit ------------------------------------------------------------------
// Use mousedown so the IPC fires before the blur→hide sequence on macOS.
