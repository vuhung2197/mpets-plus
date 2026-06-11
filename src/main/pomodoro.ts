import { EventEmitter } from "events";

export type PomodoroPhase = "focus" | "shortBreak" | "longBreak";

export interface PomodoroState {
  phase: PomodoroPhase;
  remaining: number;
  running: boolean;
  completedFocus: number;
}

export interface PomoDurations {
  focus: number;      // minutes
  shortBreak: number;
  longBreak: number;
}

const DEFAULTS: PomoDurations = { focus: 25, shortBreak: 5, longBreak: 15 };
const LONG_BREAK_EVERY = 4;

function toSecs(mins: number): number {
  return Math.max(1, Math.min(120, mins)) * 60;
}

export class Pomodoro extends EventEmitter {
  private phase: PomodoroPhase = "focus";
  private durations: Record<PomodoroPhase, number>;
  private remaining: number;
  private running = false;
  private completedFocus = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(saved?: PomoDurations) {
    super();
    const d = saved ?? DEFAULTS;
    this.durations = {
      focus: toSecs(d.focus),
      shortBreak: toSecs(d.shortBreak),
      longBreak: toSecs(d.longBreak),
    };
    this.remaining = this.durations.focus;
  }

  getState(): PomodoroState {
    return {
      phase: this.phase,
      remaining: this.remaining,
      running: this.running,
      completedFocus: this.completedFocus,
    };
  }

  getDurations(): PomoDurations {
    return {
      focus: this.durations.focus / 60,
      shortBreak: this.durations.shortBreak / 60,
      longBreak: this.durations.longBreak / 60,
    };
  }

  setDuration(phase: PomodoroPhase, minutes: number): void {
    this.durations[phase] = toSecs(minutes);
    if (this.phase === phase && !this.running) {
      this.remaining = this.durations[phase];
      this.emitUpdate();
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.tick(), 1000);
    this.emitUpdate();
  }

  pause(): void {
    if (!this.running) return;
    this.running = false;
    this.clearTimer();
    this.emitUpdate();
  }

  reset(): void {
    this.clearTimer();
    this.running = false;
    this.phase = "focus";
    this.completedFocus = 0;
    this.remaining = this.durations.focus;
    this.emitUpdate();
  }

  skip(): void {
    this.advancePhase();
    this.emitUpdate();
  }

  private tick(): void {
    this.remaining -= 1;
    if (this.remaining <= 0) {
      const finished = this.phase;
      this.advancePhase();
      this.emit("phase-complete", finished);
    }
    this.emitUpdate();
  }

  private advancePhase(): void {
    if (this.phase === "focus") {
      this.completedFocus += 1;
      this.phase =
        this.completedFocus % LONG_BREAK_EVERY === 0 ? "longBreak" : "shortBreak";
    } else {
      this.phase = "focus";
    }
    this.remaining = this.durations[this.phase];
  }

  private clearTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private emitUpdate(): void {
    this.emit("update", this.getState());
  }
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
