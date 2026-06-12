#!/usr/bin/env bash
set -e

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}▶ $*${RESET}"; }
success() { echo -e "${GREEN}✔ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $*${RESET}"; }
error()   { echo -e "${RED}✖ $*${RESET}"; exit 1; }

# ── Đi đến root project ───────────────────────────────────────────────────────
cd "$(dirname "$0")/.."

# ── Kiểm tra điều kiện ────────────────────────────────────────────────────────
command -v gh   >/dev/null 2>&1 || error "Cần cài GitHub CLI (brew install gh)"
command -v node >/dev/null 2>&1 || error "Cần cài Node.js"
command -v git  >/dev/null 2>&1 || error "Cần cài git"

if [ -n "$(git status --porcelain | grep -v '^?? release/')" ]; then
  warn "Có file chưa commit:"
  git status --short | grep -v '^?? release/'
  echo ""
  read -r -p "Vẫn tiếp tục? (y/N) " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 0
fi

# ── Đọc version hiện tại ─────────────────────────────────────────────────────
CURRENT=$(node -p "require('./package.json').version")
echo ""
echo -e "${BOLD}Version hiện tại: ${CYAN}v${CURRENT}${RESET}"
echo ""

# ── Tính version mới ─────────────────────────────────────────────────────────
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

PATCH_NEW="$MAJOR.$MINOR.$((PATCH + 1))"
MINOR_NEW="$MAJOR.$((MINOR + 1)).0"
MAJOR_NEW="$((MAJOR + 1)).0.0"

echo "Chọn loại cập nhật:"
echo "  1) patch  →  v${PATCH_NEW}  (sửa lỗi nhỏ)"
echo "  2) minor  →  v${MINOR_NEW}  (tính năng mới)"
echo "  3) major  →  v${MAJOR_NEW}  (thay đổi lớn)"
echo "  4) Tự nhập version"
echo ""
read -r -p "Lựa chọn (1/2/3/4): " choice

case "$choice" in
  1) NEW_VERSION="$PATCH_NEW" ;;
  2) NEW_VERSION="$MINOR_NEW" ;;
  3) NEW_VERSION="$MAJOR_NEW" ;;
  4)
    read -r -p "Nhập version mới (ví dụ: 1.2.3): " NEW_VERSION
    [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || error "Version không hợp lệ"
    ;;
  *) error "Lựa chọn không hợp lệ" ;;
esac

echo ""
read -r -p "Release notes (mô tả thay đổi): " NOTES
[[ -z "$NOTES" ]] && NOTES="Release v${NEW_VERSION}"

echo ""
echo -e "${BOLD}Sắp thực hiện:${RESET}"
echo -e "  Version : ${CYAN}v${CURRENT}${RESET} → ${GREEN}v${NEW_VERSION}${RESET}"
echo -e "  Notes   : ${NOTES}"
echo ""
read -r -p "Xác nhận? (y/N) " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || exit 0

echo ""

# ── Bước 1: Bump version ─────────────────────────────────────────────────────
info "Bước 1/5 — Cập nhật version trong package.json..."
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '${NEW_VERSION}';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
success "Version đã cập nhật → v${NEW_VERSION}"

# ── Bước 2: Kiểm tra TypeScript ──────────────────────────────────────────────
info "Bước 2/5 — Kiểm tra TypeScript..."
npx tsc --noEmit || error "Lỗi TypeScript — sửa trước khi release"
success "TypeScript không có lỗi"

# ── Bước 3: Build ────────────────────────────────────────────────────────────
info "Bước 3/5 — Build file phân phối..."
npm run dist 2>&1 | grep -E '^\s+•|error|Error' || true

# Kiểm tra file bắt buộc
DMG="release/MPets Plus-${NEW_VERSION}-arm64.dmg"
ZIP="release/MPets Plus-${NEW_VERSION}-arm64-mac.zip"
YML="release/latest-mac.yml"

[ -f "$DMG" ] || error "Không tìm thấy: $DMG"
[ -f "$ZIP" ] || error "Không tìm thấy: $ZIP"
[ -f "$YML" ] || error "Không tìm thấy: $YML"
success "Build thành công"

# ── Bước 4: Commit và push ───────────────────────────────────────────────────
info "Bước 4/5 — Commit và push lên GitHub..."
git add package.json package-lock.json
git commit -m "release: v${NEW_VERSION} — ${NOTES}"
git push
success "Đã push lên GitHub"

# ── Bước 5: Tạo GitHub Release ───────────────────────────────────────────────
info "Bước 5/5 — Tạo GitHub Release..."
gh release create "v${NEW_VERSION}" \
  "$DMG" \
  "$ZIP" \
  "$YML" \
  --title "v${NEW_VERSION}" \
  --notes "$NOTES"

echo ""
echo -e "${GREEN}${BOLD}🎉 Release v${NEW_VERSION} hoàn thành!${RESET}"
echo -e "Người dùng sẽ tự động nhận được cập nhật khi mở app."
