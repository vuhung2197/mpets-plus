import OpenAI from "openai";
import { getApiKey } from "./settings";
import type { PomodoroState, PomodoroPhase } from "./pomodoro";
import { PHASE_LABELS, TIMER_ACTION_RESULTS } from "../shared/constants";

const MODEL = "gpt-4o-mini";

const BASE_SYSTEM = [
  "Bạn là Pixel, một thú cưng pixel-art dễ thương sống trong thanh menu macOS của người dùng.",
  "Bạn đồng hành cùng người dùng trong khi họ làm việc theo kỹ thuật Pomodoro.",
  "Tính cách: thân thiện, vui vẻ, hơi tinh nghịch, và súc tích.",
  "Luôn trả lời bằng ngôn ngữ người dùng đang dùng.",
  "Giữ câu trả lời ngắn (1–4 câu) trừ khi được yêu cầu chi tiết hơn.",
  "Nhẹ nhàng khuyến khích tập trung trong giờ làm, và khuyến khích nghỉ thực sự trong giờ nghỉ.",
  "QUAN TRỌNG: Khi người dùng yêu cầu bất kỳ hành động nào liên quan đến hẹn giờ (bắt đầu, dừng, tạm dừng, đặt lại, bỏ qua, thay đổi thời gian), BẮT BUỘC phải gọi tool tương ứng ngay lập tức — không được chỉ mô tả hoặc giải thích mà không gọi tool.",
].join(" ");

export interface TimerControls {
  start(): void;
  pause(): void;
  reset(): void;
  skip(): void;
  setDuration(phase: PomodoroPhase, minutes: number): void;
}

export interface ChatCallbacks {
  onToken: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

let history: Message[] = [];
let client: OpenAI | null = null;
let clientKey: string | null = null;

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "control_timer",
      description:
        "Điều khiển hẹn giờ Pomodoro: bắt đầu, tạm dừng, đặt lại, hoặc bỏ qua sang giai đoạn tiếp theo.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["start", "pause", "reset", "skip"],
            description: "Hành động cần thực hiện",
          },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_duration",
      description: "Thay đổi độ dài của một giai đoạn Pomodoro.",
      parameters: {
        type: "object",
        properties: {
          phase: {
            type: "string",
            enum: ["focus", "shortBreak", "longBreak"],
            description: "focus = tập trung, shortBreak = nghỉ ngắn, longBreak = nghỉ dài",
          },
          minutes: {
            type: "number",
            description: "Số phút (1–120)",
          },
        },
        required: ["phase", "minutes"],
      },
    },
  },
];

function getClient(): OpenAI | null {
  const key = getApiKey();
  if (!key) return null;
  if (!client || clientKey !== key) {
    client = new OpenAI({ apiKey: key });
    clientKey = key;
  }
  return client;
}

export function resetConversation(): void {
  history = [];
}

function runTool(
  name: string,
  argsJson: string,
  controls: TimerControls,
): string {
  try {
    const args = JSON.parse(argsJson);
    if (name === "control_timer") {
      const action: "start" | "pause" | "reset" | "skip" = args.action;
      controls[action]?.();
      return TIMER_ACTION_RESULTS[action] ?? "Thực hiện thành công.";
    }
    if (name === "set_duration") {
      const phase: PomodoroPhase = args.phase;
      const minutes: number = args.minutes;
      controls.setDuration(phase, minutes);
      return `Đã đặt thời gian ${PHASE_LABELS[phase] ?? phase} thành ${minutes} phút.`;
    }
  } catch {
    // fall through
  }
  return "Không thể thực hiện hành động.";
}

export async function streamChat(
  userText: string,
  pomodoroState: PomodoroState,
  pomodoroDurations: { focus: number; shortBreak: number; longBreak: number },
  timerControls: TimerControls,
  cb: ChatCallbacks,
): Promise<void> {
  const openai = getClient();
  if (!openai) {
    cb.onError("Chưa có API key. Thêm OpenAI API key trong tab Cài đặt.");
    return;
  }

  const system =
    BASE_SYSTEM +
    `\n\nTrạng thái Pomodoro hiện tại: giai đoạn=${pomodoroState.phase}, ` +
    `${pomodoroState.running ? "đang chạy" : "tạm dừng"}, ` +
    `còn ${Math.ceil(pomodoroState.remaining / 60)} phút, ` +
    `${pomodoroState.completedFocus} phiên tập trung hoàn thành hôm nay. ` +
    `Thời gian đã cài đặt: tập trung=${pomodoroDurations.focus} phút, ` +
    `nghỉ ngắn=${pomodoroDurations.shortBreak} phút, ` +
    `nghỉ dài=${pomodoroDurations.longBreak} phút.`;

  const historyStart = history.length;
  history.push({ role: "user", content: userText });

  const buildMessages = (): Message[] => [
    { role: "system", content: system },
    ...history,
  ];

  // Accumulated tool calls keyed by index (OpenAI streams them by index)
  type ToolCallAccum = { id: string; name: string; args: string };

  try {
    // --- First pass: may result in tool calls or direct text ---
    const stream1 = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 512,
      stream: true,
      tools: TOOLS,
      tool_choice: "auto",
      messages: buildMessages(),
    });

    let textReply = "";
    const toolMap: Record<number, ToolCallAccum> = {};

    for await (const chunk of stream1) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;

      if (delta.content) {
        textReply += delta.content;
        cb.onToken(delta.content);
      }

      for (const tc of delta.tool_calls ?? []) {
        if (!toolMap[tc.index]) toolMap[tc.index] = { id: "", name: "", args: "" };
        const acc = toolMap[tc.index];
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name = tc.function.name;
        if (tc.function?.arguments) acc.args += tc.function.arguments;
      }
    }

    const toolCalls = Object.values(toolMap).filter(t => t.name);

    if (toolCalls.length > 0) {
      // Execute every tool in order and collect results
      const assistantMsg: Message = {
        role: "assistant",
        content: textReply || null,
        tool_calls: toolCalls.map(t => ({
          id: t.id,
          type: "function" as const,
          function: { name: t.name, arguments: t.args },
        })),
      };
      history.push(assistantMsg);

      for (const t of toolCalls) {
        const result = runTool(t.name, t.args, timerControls);
        history.push({ role: "tool", tool_call_id: t.id, content: result });
      }

      // --- Second pass: stream the conversational follow-up ---
      const stream2 = await openai.chat.completions.create({
        model: MODEL,
        max_tokens: 256,
        stream: true,
        messages: buildMessages(),
      });

      let reply2 = "";
      for await (const chunk of stream2) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          reply2 += delta.content;
          cb.onToken(delta.content);
        }
      }
      history.push({ role: "assistant", content: reply2 });
    } else {
      history.push({ role: "assistant", content: textReply });
    }

    cb.onDone();
  } catch (err) {
    history.splice(historyStart);
    cb.onError(err instanceof Error ? err.message : String(err));
  }
}
