# Mac Pet Plus

Thú cưng pixel sống trong thanh menu macOS — giống Mac Pet nhưng có nhiều tính năng hơn.

- 🐾 **Thú cưng di chuyển trên thanh menu** — nhân vật pixel-art hoạt hình di chuyển qua lại trong vùng 200px ở trung tâm màn hình (ngay dưới notch nếu có), hiển thị thời gian đếm ngược Pomodoro ngay trong strip.
- 🍅 **Hẹn giờ Pomodoro** — 25 phút tập trung / 5 phút nghỉ ngắn / 15 phút nghỉ dài, nghỉ dài sau mỗi 4 phiên tập trung. Thông báo khi chuyển giai đoạn.
- 💬 **Chat với thú cưng** — nói chuyện với Pixel, hỗ trợ bởi OpenAI API (`gpt-4o-mini`, streaming). Có thể ra lệnh hẹn giờ bằng ngôn ngữ tự nhiên.
- 🎭 **Cảm xúc** — thú cưng có 5 trạng thái: nghỉ ngơi, tập trung (khi đang đếm giờ làm việc), thư giãn (khi nghỉ), **ăn mừng** (sau khi hoàn thành một phiên tập trung, ~5 giây), và **buồn ngủ** (ngủ gật sau 5 phút không có hẹn giờ; thức dậy khi mở popup).
- 🎨 **Giao diện** — chọn giữa **Mèo**, **Blob**, và **Ma** trong tab Cài đặt.
- 🖥️ **Đa màn hình** — tự động tạo strip thú cưng trên mỗi màn hình đang kết nối.

## Công nghệ

Electron + TypeScript. Không dùng bundler — `tsc` biên dịch ra `dist/`, một script nhỏ copy HTML/CSS của renderer.

## Cấu trúc dự án

```
src/
  main/          Electron main process
    main.ts        entry point — cửa sổ popup, kết nối IPC
    menubar-pet.ts thú cưng di chuyển trên thanh menu (một window per màn hình)
    tray.ts        định nghĩa kiểu PetState, Skin
    pomodoro.ts    state machine hẹn giờ Pomodoro
    chat.ts        streaming chat qua OpenAI SDK + function calling
    settings.ts    lưu cấu hình (userData/config.json)
  preload/
    preload.ts     contextBridge — API window.petAPI cho renderer popup
    pet-preload.ts contextBridge — API window.desktopPet cho strip thú cưng
  renderer/
    index.html     giao diện popup (tab Hẹn giờ / Chat / Cài đặt)
    menubar-pet.html  cửa sổ strip thú cưng (200px, trong suốt)
    styles.css
    renderer.ts
    menubar-pet.ts
scripts/
  generate-assets.js  tạo các frame PNG pixel-pet theo skin/trạng thái
  copy-static.js      copy HTML/CSS vào dist/
assets/pet/<skin>/    frame ảnh thú cưng (<trạng-thái>-<frame>.png)
```

## Cài đặt

```bash
npm install
npm run generate-assets   # tạo assets/pet/*.png (chạy một lần)
npm start                 # biên dịch và khởi động ứng dụng
```

Thú cưng xuất hiện trên thanh menu (ứng dụng không có icon Dock). **Click** vào thú cưng để mở popup. Dùng nút **Thoát ứng dụng** trong popup để đóng chương trình.

## API Key

Tính năng chat cần OpenAI API key. Có hai cách thiết lập:

- Mở popup → tab **Cài đặt** → dán key vào → Lưu key, hoặc
- Đặt `OPENAI_API_KEY` trong biến môi trường (xem `.env.example`).

Key được lưu cục bộ trong `userData/config.json` của ứng dụng.

## Lộ trình phát triển

- Giai đoạn 1 ✅ — thú cưng trên menu bar, Pomodoro, chat.
- Giai đoạn 2 ✅ — cảm xúc thú cưng (ăn mừng / buồn ngủ), chọn giao diện.
- Giai đoạn 3 ✅ — thời gian Pomodoro tuỳ chỉnh, ra lệnh hẹn giờ qua chat, đa màn hình, background toggle, hiển thị thời gian trong strip.
- Ý tưởng tương lai: thống kê & lịch sử Pomodoro, cảnh báo âm thanh, thêm giao diện thú cưng.
