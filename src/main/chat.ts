import OpenAI from "openai";
import { getApiKey } from "./settings";
import type { PomodoroState, PomodoroPhase } from "./pomodoro";

const MODEL = "gpt-4o-mini";

const BASE_SYSTEM = [
  "Bạn là Pixel, một thú cưng pixel-art dễ thương sống trong thanh menu macOS của người dùng.",
  "Bạn đồng hành cùng người dùng trong khi họ làm việc theo kỹ thuật Pomodoro.",
  "Tính cách: thân thiện, vui vẻ, hơi tinh nghịch, và súc tích.",
  "Luôn trả lời bằng ngôn ngữ người dùng đang dùng.",
  "Giữ câu trả lời ngắn (1–4 câu) trừ khi được yêu cầu chi tiết hơn.",
  "Nhẹ nhàng khuyến khích tập trung trong giờ làm, và khuyến khích nghỉ thực sự trong giờ nghỉ.",
  "Bạn có thể điều khiển hẹn giờ Pomodoro khi người dùng yêu cầu.",
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
      const labels: Record<string, string> = {
        start: "Đã bắt đầu hẹn giờ.",
        pause: "Đã tạm dừng hẹn giờ.",
        reset: "Đã đặt lại hẹn giờ.",
        skip: "Đã bỏ qua sang giai đoạn tiếp theo.",
      };
      controls[action]?.();
      return labels[action] ?? "Thực hiện thành công.";
    }
    if (name === "set_duration") {
      const phase: PomodoroPhase = args.phase;
      const minutes: number = args.minutes;
      controls.setDuration(phase, minutes);
      const phaseLabel: Record<string, string> = {
        focus: "tập trung",
        shortBreak: "nghỉ ngắn",
        longBreak: "nghỉ dài",
      };
      return `Đã đặt thời gian ${phaseLabel[phase] ?? phase} thành ${minutes} phút.`;
    }
  } catch {
    // fall through
  }
  return "Không thể thực hiện hành động.";
}

export async function streamChat(
  userText: string,
  pomodoroState: PomodoroState,
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
    `${pomodoroState.completedFocus} phiên tập trung hoàn thành hôm nay.`;

  const historyStart = history.length;
  history.push({ role: "user", content: userText });

  const buildMessages = (): Message[] => [
    { role: "system", content: system },
    ...history,
  ];

  try {
    // --- First pass: may result in a tool call or direct text ---
    const stream1 = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 512,
      stream: true,
      tools: TOOLS,
      messages: buildMessages(),
    });

    let textReply = "";
    let toolId = "";
    let toolName = "";
    let toolArgs = "";
    let hasToolCall = false;

    for await (const chunk of stream1) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;

      if (delta.content) {
        textReply += delta.content;
        cb.onToken(delta.content);
      }

      const tc = delta.tool_calls?.[0];
      if (tc) {
        hasToolCall = true;
        if (tc.id) toolId = tc.id;
        if (tc.function?.name) toolName = tc.function.name;
        if (tc.function?.arguments) toolArgs += tc.function.arguments;
      }
    }

    if (hasToolCall && toolName) {
      // Execute the tool
      const toolResult = runTool(toolName, toolArgs, timerControls);

      // Build the assistant tool-call message
      const assistantMsg: Message = {
        role: "assistant",
        content: textReply || null,
        tool_calls: [
          {
            id: toolId,
            type: "function",
            function: { name: toolName, arguments: toolArgs },
          },
        ],
      };
      history.push(assistantMsg);
      history.push({ role: "tool", tool_call_id: toolId, content: toolResult });

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
