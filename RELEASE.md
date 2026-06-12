# Hướng dẫn phát hành bản cập nhật

Làm theo đúng thứ tự. Toàn bộ quy trình mất khoảng 5–10 phút.

---

## Bước 1 — Cập nhật version

Mở `package.json`, sửa dòng `"version"`:

```json
"version": "0.1.1"
```

Quy tắc đặt số version:
- `0.1.0` → `0.1.1` — sửa lỗi nhỏ
- `0.1.0` → `0.2.0` — thêm tính năng mới
- `0.1.0` → `1.0.0` — thay đổi lớn / phá vỡ tương thích

---

## Bước 2 — Kiểm tra code trước khi build

```bash
npx tsc --noEmit
```

Không có lỗi → tiếp tục. Nếu có lỗi TypeScript → sửa trước.

---

## Bước 3 — Build file phân phối

**Chỉ macOS:**
```bash
npm run dist
```

**Chỉ Windows** (cross-compile từ Mac):
```bash
npm run dist:win
```

**Cả hai cùng lúc:**
```bash
npm run build && electron-builder --mac --win --publish never
```

Sau khi chạy xong, thư mục `release/` sẽ có:
```
release/
  MPets Plus-0.1.1-arm64.dmg          ← file cài macOS
  MPets Plus-0.1.1-arm64-mac.zip      ← bắt buộc cho auto-update macOS
  latest-mac.yml                       ← bắt buộc cho auto-update macOS
  MPets Plus Setup 0.1.1.exe          ← file cài Windows
  latest.yml                           ← bắt buộc cho auto-update Windows
```

> **Quan trọng:** Phải có đủ cả file `.zip` / `.exe` lẫn file `.yml` — thiếu một trong hai thì auto-update không hoạt động.

---

## Bước 4 — Commit và đẩy code lên GitHub

```bash
git add -A
git commit -m "release: v0.1.1 — mô tả ngắn thay đổi"
git push
```

---

## Bước 5 — Tạo GitHub Release

```bash
gh release create v0.1.1 \
  "release/MPets Plus-0.1.1-arm64.dmg" \
  "release/MPets Plus-0.1.1-arm64-mac.zip" \
  "release/latest-mac.yml" \
  "release/MPets Plus Setup 0.1.1.exe" \
  "release/latest.yml" \
  --title "v0.1.1" \
  --notes "Mô tả những gì thay đổi trong bản này"
```

> Nếu chỉ release macOS thì bỏ 2 dòng file Windows đi.

Kiểm tra lại trên GitHub: vào tab **Releases** của repo, đảm bảo release vừa tạo có đủ tất cả các file đính kèm.

---

## Người dùng nhận update như thế nào

Người dùng **không cần làm gì**. Khi họ mở app:
1. App tự kiểm tra GitHub Releases sau 3 giây
2. Phát hiện version mới → hiện thông báo "đang tải về..."
3. Tải xong → hỏi "Khởi động lại để cài đặt?"
4. Bấm **Khởi động lại ngay** → xong

---

## Checklist nhanh

```
[ ] Sửa "version" trong package.json
[ ] npx tsc --noEmit  →  không lỗi
[ ] npm run dist  →  có đủ file trong release/
[ ] git commit + git push
[ ] gh release create  →  đính kèm đủ .dmg + .zip + .yml
[ ] Vào GitHub kiểm tra release trông ổn
```
