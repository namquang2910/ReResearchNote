# Triển khai production (~1000 người dùng, chi phí thấp)

## Kiến trúc

```
Internet ──HTTPS──▶ Caddy ──/api/*──▶ NestJS (API) ──▶ PostgreSQL
                      │
                      └──── /* ────▶ Next.js (web)
```

Tất cả chạy trên **một VPS nhỏ** bằng Docker Compose. Web và API chung một domain (`/api`), nên không cần CORS và cookie đăng nhập là first-party (`HttpOnly`, `SameSite=Lax`, `Secure`).

| Hạng mục | Chọn | Chi phí |
|---|---|---|
| VPS 2 vCPU / 4 GB (Hetzner CX22, DigitalOcean, Vultr…) | 1 máy | ~€4–7 / tháng |
| Tên miền | bất kỳ | ~$10–15 / năm |
| HTTPS | Caddy + Let's Encrypt | miễn phí |
| Backup ngoài máy (Cloudflare R2 / Backblaze B2) | vài trăm MB | ~$0–1 / tháng |
| AI (tuỳ chọn) | Anthropic API, có hạn mức mỗi người/ngày | xem mục *AI* |

### Vì sao dùng Docker Compose?

Không bắt buộc, nhưng nó giúp: (1) **dựng y hệt** trên mọi máy chỉ bằng `docker compose up -d` (web + API + DB + HTTPS + backup là 5 tiến trình cần cài/cấu hình đúng phiên bản); (2) **cập nhật/rollback** bằng một lệnh, không để lại rác trên server; (3) cô lập, DB không lộ ra ngoài (chỉ Caddy mở cổng 80/443). Nếu bạn quen cách truyền thống, xem mục *Không dùng Docker* ở cuối.

### Kiểm chứng

Toàn bộ stack này đã được dựng thật bằng đúng các file trong repo và kiểm tra: 79 test e2e qua HTTPS (đăng nhập, cô lập dữ liệu giữa người dùng, rate limit…), backup → xóa dữ liệu → **khôi phục** thành công, và tải mô phỏng 1000 người dùng (60.000 task, 600.000 log, DB 133 MB): ~700 req/s, 0 lỗi, p95 ≤ ~160 ms, API ~210 MB RAM.

---

## 1. Chuẩn bị server

1. Tạo VPS **Ubuntu 24.04**, thêm SSH key. Trỏ **A record** của domain (vd. `notes.example.com`) về IP của VPS.
2. Đăng nhập và cài Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER   # đăng xuất/đăng nhập lại
   ```
3. Tường lửa — chỉ mở SSH + web:
   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp && sudo ufw enable
   ```
4. (Khuyên dùng) tự cập nhật bản vá bảo mật: `sudo apt install unattended-upgrades`.

## 2. Triển khai

```bash
sudo mkdir -p /opt/research-notes && sudo chown $USER /opt/research-notes
git clone <repo-của-bạn> /opt/research-notes && cd /opt/research-notes
cp .env.example .env
nano .env        # điền DOMAIN, POSTGRES_PASSWORD, JWT_SECRET (xem gợi ý lệnh sinh bí mật trong file)
docker compose up -d --build
docker compose ps                       # 5 dịch vụ phải "healthy"/"Up"
curl https://notes.example.com/api/health   # {"ok":true,...}
```

Lần đầu API tự chạy `prisma migrate deploy` để tạo bảng. Caddy tự xin chứng chỉ HTTPS (cần domain đã trỏ đúng và cổng 80/443 mở).

## 3. Tài khoản đầu tiên

Mở `https://<domain>` → **Tạo tài khoản**. Khi nhóm của bạn đã đăng ký xong, có thể đóng đăng ký công khai: đặt `ALLOW_REGISTRATION=false` trong `.env` rồi `docker compose up -d`.

> Chưa có tính năng quên mật khẩu qua email (cần dịch vụ gửi mail). Người dùng đã đăng nhập đổi mật khẩu được ở **Profile → Tài khoản**. Nếu ai quên: đặt lại thủ công — `docker compose exec api node -e "const b=require('bcryptjs');const {PrismaClient}=require('@prisma/client');new PrismaClient().user.update({where:{email:'a@b.c'},data:{passwordHash:b.hashSync('MAT-KHAU-MOI',10)}}).then(()=>process.exit())"`

## 4. Nhập dữ liệu từ bản cũ (SQLite, một người dùng)

```bash
docker compose cp ./dev.db api:/tmp/old.db
docker compose exec api node scripts/import-sqlite.js --db /tmp/old.db \
  --email you@example.com --password 'MatKhauMoi123' --name 'Tên của bạn'
```
Tạo tài khoản (nếu chưa có) và gán toàn bộ dữ liệu cho tài khoản đó, giữ nguyên id, thời gian, nhãn, phụ thuộc, lịch sử log. An toàn chạy lại (bỏ qua bản ghi đã có).

## 5. AI (thêm task nhanh)

Production không có Ollama, nên dùng Anthropic API. Trong `.env`:

```
AI_PROVIDER=auto            # có ANTHROPIC_API_KEY thì dùng Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-5-5     # rẻ nhất, đủ cho việc tách task; mặc định claude-opus-5-5
AI_DAILY_LIMIT=20           # lượt/người/ngày; vượt thì tự dùng bộ tách theo luật (không tốn tiền)
```

- Mỗi lượt ≈ 1–2 nghìn token vào + ~0,5 nghìn ra. Với Haiku 5.5 (đơn giá $0,10 / $0,50 mỗi triệu token) chỉ vài phần trăm cent/lượt; Opus 5.5 ($4 / $20) đắt hơn ~40 lần — quyết định theo chất lượng bạn cần.
- Không cấu hình key thì app vẫn chạy: nút AI tự dùng bộ tách theo luật.
- `/api/ai/parse-tasks` còn bị giới hạn 12 request/phút/IP.

## 6. Backup & khôi phục

Dịch vụ `backup` chạy `pg_dump` mỗi ngày vào `./backups` (giữ 7 ngày, 4 tuần, 6 tháng).

**Đẩy ra ngoài máy** (rất nên làm — backup cùng ổ đĩa không cứu được khi mất máy):
```bash
sudo apt install rclone && rclone config        # tạo remote tên "offsite" (R2 / B2 / S3)
crontab -e   # thêm:  30 3 * * *  /opt/research-notes/deploy/backup-offsite.sh >> /var/log/research-backup.log 2>&1
```

**Khôi phục:**
```bash
./deploy/restore.sh backups/daily/research_notes-20261014.sql.gz     # gõ YES để xác nhận
```
Hãy **thử khôi phục** vào một máy khác ít nhất một lần; backup chưa thử khôi phục chưa phải là backup.

## 7. Cập nhật / rollback

```bash
cd /opt/research-notes && git pull && docker compose up -d --build
# rollback: git checkout <commit-cũ> && docker compose up -d --build
```
Migration chạy tự động khi API khởi động. Hoặc dùng workflow `.github/workflows/deploy.yml` (cần secrets `SSH_HOST`, `SSH_USER`, `SSH_KEY`).

CI (`.github/workflows/ci.yml`) chạy type-check, e2e (kể cả cô lập dữ liệu), kiểm tra AI giả lập và build 2 Docker image trên mỗi PR.

## 8. Giám sát

- **Uptime:** UptimeRobot / Better Stack (miễn phí) ping `https://<domain>/api/health` (kiểm tra cả DB).
- **Log:** `docker compose logs -f --tail=100 api`. Giới hạn dung lượng log: thêm `logging: {driver: json-file, options: {max-size: "10m", max-file: "3"}}` cho từng service nếu cần.
- **Lỗi ứng dụng:** Sentry (gói free) — thêm `@sentry/nestjs` / `@sentry/nextjs` khi cần.
- **Đĩa:** `df -h`, `docker system df`; `docker image prune -f` sau mỗi lần cập nhật.

## 9. Bảo mật — đã có và cần tự làm

Đã có trong code: bcrypt mật khẩu; phiên JWT trong cookie `HttpOnly`+`Secure`+`SameSite=Lax`; mọi truy vấn lọc theo chủ sở hữu (người khác nhận 404); rate limit toàn cục (300/phút/IP) và chặt hơn cho đăng nhập/đăng ký/AI; `helmet`; kiểm tra dữ liệu vào (`class-validator`, giới hạn độ dài/kích thước body); tài khoản bị xóa mất hiệu lực ngay (≤30s); chống open-redirect ở trang đăng nhập; token lịch 192-bit và có thể tạo lại.

Bạn cần: giữ `.env` bí mật (chmod 600), bật tự cập nhật OS, backup ngoài máy, và đặt `ALLOW_REGISTRATION=false` nếu không muốn mở công khai.

Chưa có (ghi nhận): đặt lại mật khẩu qua email, xác minh email, đăng nhập Google/SSO, 2FA, nhật ký kiểm toán.

## 10. Dung lượng & khi nào cần nâng cấp

| Chỉ số (đo ở bộ dữ liệu 1000 người) | Giá trị |
|---|---|
| Dữ liệu | 60.000 task + 600.000 log ≈ **133 MB** (người dùng điển hình < 1 MB) |
| Thông lượng một API instance | ~700 req/s liên tục; 1000 người thực tế chỉ tạo vài–vài chục req/s |
| RAM | API ~210 MB, Postgres ~200 MB, web ~100 MB |

Khi nào mở rộng: CPU API > 70% kéo dài → tăng vCPU hoặc chạy 2 bản `api` (stateless) sau Caddy; DB > vài GB → tăng đĩa/RAM, bật `pg_stat_statements` để tìm truy vấn chậm; payload danh sách lớn → phân trang `/experiments` và `/projects/:id` (hiện trả toàn bộ log, đã có nén gzip/zstd).

---

## Không dùng Docker (tuỳ chọn)

```bash
# Postgres + Node 22 + Caddy cài bằng apt, tạo DB research_notes
cd api && npm ci && npx prisma generate && npm run build
export NODE_ENV=production DATABASE_URL=... JWT_SECRET=... PUBLIC_URL=https://<domain>
npx prisma migrate deploy && npm i -g pm2 && pm2 start dist/main.js --name api && pm2 save
cd ../web && npm ci && npm run build
cd .next/standalone && cp -r ../static .next/static && cp -r ../../public ./public
PORT=3000 HOSTNAME=127.0.0.1 pm2 start server.js --name web && pm2 save && pm2 startup
# Caddy: dùng deploy/Caddyfile, đổi api:4000 → 127.0.0.1:4000 và web:3000 → 127.0.0.1:3000
```
