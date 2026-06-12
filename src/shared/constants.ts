// Tên hiển thị cho từng phase Pomodoro
export const PHASE_LABELS = {
  focus:      "Tập trung",
  shortBreak: "Nghỉ ngắn",
  longBreak:  "Nghỉ dài",
} as const;

// Tên ứng dụng
export const APP_NAME = "MPets Plus";
export const PET_NAME = "Pixel";

// Nhãn các nút điều khiển timer
export const TIMER_ACTIONS = {
  start:  "Bắt đầu",
  pause:  "Tạm dừng",
  reset:  "Đặt lại",
  skip:   "Bỏ qua",
} as const;

// Phản hồi sau khi thực hiện lệnh timer qua chat
export const TIMER_ACTION_RESULTS = {
  start: "Đã bắt đầu hẹn giờ.",
  pause: "Đã tạm dừng hẹn giờ.",
  reset: "Đã đặt lại hẹn giờ.",
  skip:  "Đã bỏ qua sang giai đoạn tiếp theo.",
} as const;

// Thông báo hệ thống (Notification)
export const NOTIFICATIONS = {
  focusDone:  "Xong rồi! Nghỉ ngơi chút nào 🎉",
  breakDone:  "Hết giờ nghỉ rồi — vào việc thôi! 💪",
  updateAvailable: (version: string) => `Phiên bản ${version} đang được tải về...`,
  updateReady: "Đã tải về bản cập nhật mới. Khởi động lại để cài đặt?",
} as const;

// Nhãn context menu (right-click pet)
export const CONTEXT_MENU = {
  open: `Mở ${PET_NAME}`,
  quit: `Thoát ${APP_NAME}`,
} as const;

// Nhãn dialog auto-update
export const UPDATE_DIALOG = {
  title:       "Cập nhật sẵn sàng",
  restartNow:  "Khởi động lại ngay",
  later:       "Để sau",
} as const;

// Nhãn tab Settings
export const SETTINGS_LABELS = {
  durationSection: "Thời gian (phút)",
  focus:           "Tập trung",
  shortBreak:      "Nghỉ ngắn",
  longBreak:       "Nghỉ dài",
  saveDurations:   "Lưu thời gian",
  background:      "Hiện nền sau pet (pill mờ trong notch)",
  skinSection:     "Hình dáng thú cưng",
  colorSection:    "Màu sắc thú cưng",
  apiKeySection:   "OpenAI API key",
  saveKey:         "Lưu key",
  keySet:          "✅ Đã cấu hình key.",
  keyMissing:      `Chưa có key — ${PET_NAME} chưa thể chat cho đến khi bạn thêm vào.`,
  resetChat:       "Xóa lịch sử chat",
} as const;

// Nhãn skin
export const SKIN_LABELS = {
  cat:   "🐱 Mèo",
  blob:  "🟠 Blob",
  ghost: "👻 Ma",
} as const;

// Nhãn màu pet
export const COLOR_LABELS = {
  default: "Mặc định",
  pink:    "Hồng",
  purple:  "Tím",
  mint:    "Xanh lá",
  dark:    "Tối",
} as const;

// Nhãn màu background
export const BG_COLOR_LABELS = {
  "rgba(0,0,0,0.40)":       "Đen",
  "rgba(255,255,255,0.25)": "Trắng",
  "rgba(244,162,97,0.55)":  "Cam",
  "rgba(80,160,220,0.55)":  "Xanh",
  "rgba(180,100,220,0.55)": "Tím",
  "rgba(60,180,140,0.55)":  "Xanh lá",
} as const;
