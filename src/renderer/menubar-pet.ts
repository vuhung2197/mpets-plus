type PetState = "idle" | "work" | "break" | "celebrate" | "sleepy";

interface Sprite { mood: PetState; frame0: string; frame1: string; }
interface Motion { facing: "left" | "right"; walking: boolean; x: number; }
interface DesktopPetAPI {
  onSprite(cb: (sprite: Sprite) => void): void;
  onMotion(cb: (motion: Motion) => void): void;
  onBackground(cb: (show: boolean) => void): void;
  onTimer(cb: (text: string) => void): void;
  activate(): void;
}

declare const desktopPet: DesktopPetAPI;

const petEl   = document.getElementById("pet")   as HTMLDivElement;
const animEl  = document.getElementById("anim")  as HTMLDivElement;
const imgEl   = document.getElementById("img")   as HTMLImageElement;
const bgEl    = document.getElementById("bg")    as HTMLDivElement;
const timerEl = document.getElementById("timer") as HTMLDivElement;

function syncTimerVisibility(): void {
  timerEl.classList.toggle("visible", timerEl.textContent !== "");
}

const BLINK_MOODS: PetState[] = ["idle", "work", "break"];
let petFrames = { frame0: "", frame1: "" };
let mood: PetState = "idle";
let blinkTimer: number | null = null;

function applyAnimClass(walking: boolean): void {
  animEl.classList.remove("walking", "celebrate", "sleepy");
  if (mood === "celebrate")   animEl.classList.add("celebrate");
  else if (mood === "sleepy") animEl.classList.add("sleepy");
  else if (walking)           animEl.classList.add("walking");
}

function stopBlink(): void {
  if (blinkTimer !== null) { clearInterval(blinkTimer); blinkTimer = null; }
}

function startBlinkLoop(): void {
  stopBlink();
  if (mood === "sleepy") {
    let on = false;
    blinkTimer = window.setInterval(() => {
      on = !on;
      imgEl.src = on ? petFrames.frame1 : petFrames.frame0;
    }, 900);
    return;
  }
  if (mood === "celebrate") {
    let on = false;
    blinkTimer = window.setInterval(() => {
      on = !on;
      imgEl.src = on ? petFrames.frame1 : petFrames.frame0;
    }, 320);
    return;
  }
  if (!BLINK_MOODS.includes(mood)) return;
  blinkTimer = window.setInterval(() => {
    imgEl.src = petFrames.frame1;
    window.setTimeout(() => { imgEl.src = petFrames.frame0; }, 140);
  }, 3200);
}

desktopPet.onSprite((sprite) => {
  petFrames = { frame0: sprite.frame0, frame1: sprite.frame1 };
  mood = sprite.mood;
  imgEl.src = petFrames.frame0;
  applyAnimClass(animEl.classList.contains("walking"));
  startBlinkLoop();
});

desktopPet.onMotion((motion) => {
  petEl.style.left = `${motion.x}px`;
  petEl.style.transform = `scaleX(${motion.facing === "left" ? -1 : 1})`;
  applyAnimClass(motion.walking);
});

desktopPet.onBackground((show) => {
  bgEl.classList.toggle("visible", show);
});

desktopPet.onTimer((text) => {
  timerEl.textContent = text;
  syncTimerVisibility();
});

petEl.addEventListener("click", () => desktopPet.activate());
