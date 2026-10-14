# ReSearch Notes

Ghi chép & theo dõi thí nghiệm nghiên cứu cho nhiều người dùng: dự án → metrics có thứ tự (kèm std) → task/experiment
(trạng thái tùy chỉnh, nhãn, log metric, changes, commits, notes, comments, phụ thuộc, hạn chót) → graph, biểu đồ,
lịch (đồng bộ Apple Calendar), thêm task bằng AI, trang Profile kiểu GitHub.

- `api/` — NestJS 10 + Prisma + **PostgreSQL**, xác thực JWT (cookie HttpOnly), mọi dữ liệu theo từng người dùng
- `web/` — Next.js 14 (App Router) + Tailwind + TanStack Query + React Flow + Recharts; tiếng Việt / English; sáng / tối
- `deploy/`, `docker-compose.yml`, `.github/` — triển khai production, CI, backup → xem **[DEPLOY.md](DEPLOY.md)**

## Chạy khi phát triển

```bash
# 1) Postgres (cổng 5433). Dùng cụm Homebrew ở ./.pgdata nếu có, không thì Docker
cd api && npm run db:start

# 2) API (http://localhost:4000)
npm install
npx prisma migrate deploy
npm run dev

# 3) Web (http://localhost:3000) — terminal khác
cd web && npm install && npm run dev
```

- Trình duyệt luôn gọi `/api` cùng origin; Next chuyển tiếp tới API theo `API_ORIGIN` (`web/.env.local`, mặc định `http://localhost:4000`).
- Cấu hình API ở `api/.env` (xem file mẫu): `DATABASE_URL`, `JWT_SECRET`, `ALLOW_REGISTRATION`, `AI_PROVIDER`, `PUBLIC_URL`…
- Mở app → **Tạo tài khoản**. Người mới có 4 trạng thái mặc định và nút *Thử với dự án mẫu*.
- Nhập dữ liệu từ bản SQLite cũ (một người dùng):
  `cd api && npm run build && node scripts/import-sqlite.js --db path/to/dev.db --email you@example.com --password '…'`

## Kiểm thử

```bash
cd api && npm run build
PORT=4001 AI_PROVIDER=none node dist/main &      # API thử
BASE=http://localhost:4001 npm run test:e2e      # 79 kiểm tra: đăng nhập, cô lập dữ liệu giữa người dùng, rate limit, xóa tài khoản…
```
`node test/ai.js` kiểm tra đường AI (Anthropic giả lập, hạn mức, dự phòng). CI chạy cả hai cùng type-check và build Docker.

## Cô lập dữ liệu giữa người dùng

Mọi tài nguyên (dự án, metric, nhãn, task, log, note, trạng thái, link lịch) thuộc về một người dùng. Mọi truy vấn đi qua
`AccessService` hoặc lọc theo `ownerId`; truy cập tài nguyên của người khác trả **404** (không lộ sự tồn tại). Bộ e2e thử hơn
30 hướng tấn công (đọc/sửa/xóa chéo, tham chiếu chéo metric/nhãn/trạng thái, tìm kiếm, thống kê, AI, link lịch…).

## Tính năng

| Khu vực | Mô tả |
|---|---|
| Tasks | Danh sách / Board ngang (kéo-thả đổi trạng thái) / Table sắp xếp được; ẩn task hoàn thành; hạn chót |
| Metrics | Thứ tự tùy chỉnh, đơn vị, hướng tốt hơn, **± std**, biểu đồ có thanh sai số |
| Graph | Phụ thuộc giữa task (Luồng → / ↓ / Mạng lưới), nối bằng cách kéo |
| Cấu hình | Metric, nhãn, trạng thái (tên/màu/loại) qua popup; ô tìm kiếm gợi ý dùng lại từ các dự án khác |
| Calendar | Lịch tháng, lọc theo trạng thái/dự án, **link `.ics`** đồng bộ Apple/Google Calendar |
| AI | Dán văn bản → tách task, hạn, nhãn, phụ thuộc → xem lại → tạo. Anthropic (có hạn mức/ngày) hoặc Ollama (local); luôn có bộ tách theo luật dự phòng |
| Profile | Heatmap 12 tháng, streak, mục tiêu tuần, tiến độ từng dự án, đổi mật khẩu, xuất/xóa dữ liệu |

## Mẹo

- `⌘K` / `Ctrl+K`: thêm nhanh bằng AI.
- Liên kết sâu: `/projects/:id?task=<taskId>&tab=notes` mở sẵn drawer của task.
- Thêm chuỗi giao diện mới: dùng `t('…tiếng Việt…')` từ `@/lib/i18n` rồi thêm bản dịch vào `web/src/lib/en.ts`.
