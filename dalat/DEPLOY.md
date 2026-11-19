# Triển khai Đà Lạt Homestay lên VPS

Stack: Docker Compose (`db` Postgres 16, `redis`, `web` = Next + Socket.io, `worker` = BullMQ, `backup-db`).
`web` chỉ lắng nghe `127.0.0.1:3200`; nginx/Caddy trên máy chủ làm HTTPS và proxy vào đó.
Chạy chung VPS với hmstay được (hmstay dùng cổng 3100, app này dùng 3200).

## Cần có trước
- VPS có Docker + Docker Compose, ≥ 2 GB RAM (build image dùng ~1,5 GB, nên có swap nếu máy nhỏ).
- Một (sub)domain trỏ DNS về IP VPS, ví dụ `dalat.example.com`.
- Tài khoản Cloudflare R2 (bucket + khoá API), Telegram bot (@BotFather) — tuỳ chọn nhưng nên có.

## Lần đầu
```bash
git clone <repo> hmstay && cd hmstay/dalat
cp .env.production.example .env
nano .env          # điền APP_URL, POSTGRES_PASSWORD, BETTER_AUTH_SECRET, R2_*, TELEGRAM_*, VAPID_*
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml --env-file .env ps     # web phải "healthy"
```
Migration chạy tự động khi `web` khởi động. Tạo khoá:
```bash
openssl rand -base64 32        # BETTER_AUTH_SECRET
openssl rand -hex 24           # POSTGRES_PASSWORD, TELEGRAM_WEBHOOK_SECRET
npx web-push generate-vapid-keys   # VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (và NEXT_PUBLIC_VAPID_PUBLIC_KEY = khoá public)
```

## HTTPS (nginx + certbot)
```bash
sudo cp deploy/nginx-dalat.conf /etc/nginx/sites-available/dalat   # sửa server_name thành domain của bạn
sudo ln -s ../sites-available/dalat /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d dalat.tenmiencuaban.com
```
File mẫu tự đủ (không cần khai báo `map` ở cấp `http {}`). Khối `location /socket.io/` là bắt buộc — thiếu thì chat real-time không chạy.
Cookie đăng nhập chỉ an toàn khi `APP_URL` là `https://…` (đặt đúng domain trước khi build).

## Bảo mật đăng nhập
- **Giới hạn thử sai:** 5 lần sai/15 phút cho mỗi tài khoản và 30 lần/15 phút cho mỗi IP; đăng ký 10/giờ/IP; quên mật khẩu 3/giờ/tài khoản. Bộ đếm lưu ở Redis (mất Redis thì tự dùng bộ nhớ của tiến trình).
- **IP thật:** app tin header `X-Real-IP` do nginx đặt (`proxy_set_header X-Real-IP $remote_addr;` — đã có trong file mẫu). Thiếu dòng này thì mọi người dùng chung 1 IP và giới hạn theo IP sẽ chặn nhầm.
- **Quên mật khẩu:** link gửi qua email thật (cần điền `SMTP_*`) và/hoặc Telegram đã kết nối. Tài khoản chỉ có SĐT mà không có cả hai thì không tự khôi phục được — quản trị viên có thể đặt lại thủ công.
- Header bảo mật (HSTS, chống iframe…) bật sẵn ở production.

## Telegram
```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d url="https://dalat.example.com/api/telegram/webhook" -d secret_token="<TELEGRAM_WEBHOOK_SECRET>"
```
Người dùng liên kết ở trang **Tài khoản → Kết nối Telegram**.

## Cloudflare R2
- Bucket cần **domain công khai** (đặt vào `R2_PUBLIC_URL`) để hiển thị ảnh.
- Bật CORS cho bucket: `PUT` để trình duyệt upload thẳng lên R2; `GET`/`HEAD` vì ảnh bìa trên phiếu xác nhận dùng `crossOrigin` (xuất PNG) — thiếu thì ảnh bìa không hiện:
```json
[{ "AllowedOrigins": ["https://dalat.example.com"], "AllowedMethods": ["GET", "HEAD", "PUT"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 3600 }]
```
- Các biến `R2_*` đọc lúc chạy: sửa `.env` rồi `docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate web worker` (không cần `--build`).

## Cập nhật phiên bản mới
```bash
cd hmstay/dalat && ./deploy/update.sh
```
(`git pull` → build → khởi động lại → chờ `web` healthy.) Đổi `APP_URL` hoặc `NEXT_PUBLIC_*` cần build lại (`update.sh` đã `--build`).

## Vận hành
```bash
C="docker compose -f docker-compose.prod.yml --env-file .env"
$C logs -f --tail 100 web        # log web (hoặc: worker, db)
$C ps                            # trạng thái
$C restart web worker
curl -s http://127.0.0.1:3200/api/health      # {"ok":true}
```
- **Sao lưu DB:** tự động mỗi 24 giờ vào `dalat/backups/*.dump` (giữ 7 ngày). Khôi phục từ bản trên VPS:
  `docker compose -f docker-compose.prod.yml --env-file .env exec -T db pg_restore -U dalat -d dalat --clean --if-exists < backups/<file>.dump`
  Bản đầu tiên sau khi khởi động có thể rỗng (chụp trước khi migration chạy xong) — các bản sau mới có dữ liệu.
- **Worker** phải luôn chạy: thiếu nó thì giữ phòng 30 phút không tự nhả (booking hết hạn vẫn không chặn lịch, nhưng không có tin nhắn/thông báo) và không có nhắc check-in.
- **Quay lui:** `git checkout <commit-cũ> && ./deploy/update.sh` (migration chỉ tiến, không tự lùi — hãy sao lưu trước khi cập nhật bản có migration mới).

## Giám sát & sao lưu ra ngoài VPS

Stack có 2 service thêm: `monitor` (kiểm tra mỗi phút) và `backup-sync` (đẩy sao lưu ra R2).

### 1. Nhận cảnh báo (Telegram)
1. Điền `TELEGRAM_BOT_TOKEN` (như phần Telegram ở trên) rồi nhắn `/id` cho bot → bot trả về chat ID của bạn.
2. Điền `ADMIN_TELEGRAM_CHAT_ID=<chat id>` (và/hoặc `ADMIN_EMAIL` nếu đã cấu hình SMTP) vào `.env`.
3. `docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate monitor`
   Nhận được tin “🟢 Giám sát đã khởi động” là đúng.

`monitor` theo dõi: web (`/api/health`), DB, Redis, **nhịp tim của worker**, giữ phòng quá hạn mà chưa được nhả, job nền bị lỗi, tuổi bản sao lưu mới nhất, dung lượng đĩa (≥ 90%), và tình trạng đồng bộ R2.
Chỉ báo khi lỗi **2 lần liên tiếp** (tránh báo nhầm), báo khi hồi phục, nhắc lại mỗi 6 giờ nếu chưa sửa. Worker chết được phát hiện sau ~2 phút (nhịp tim hết hạn 120 giây).

### 2. Phát hiện cả VPS/Docker sập (bắt buộc nên làm)
`monitor` chạy trên chính VPS nên không tự báo được khi máy sập. Dùng thêm dịch vụ bên ngoài (đều có gói miễn phí):
- **healthchecks.io** (hoặc Better Stack Heartbeat): tạo 1 check chu kỳ 1 phút, grace 5 phút, nhập Telegram/email của bạn; copy URL ping vào `HEARTBEAT_URL`. `monitor` ping URL này mỗi chu kỳ — **ngừng ping thì họ báo bạn**.
- **UptimeRobot**: thêm monitor HTTP(s) tới `https://dalat.tenmiencuaban.com/api/health` (kiểm tra mỗi 5 phút) — phát hiện sập từ phía người dùng (nginx, DNS, chứng chỉ hết hạn).

### 3. Sao lưu ra ngoài VPS (R2, có mã hoá)
1. Cloudflare R2 → tạo **bucket riêng, KHÔNG bật public** (khác bucket ảnh), ví dụ `dalat-backups`.
2. Tạo API token **Object Read & Write** cho bucket đó (hoặc dùng chung token nếu nó đã bao gồm cả 2 bucket).
3. Điền `.env`: `BACKUP_R2_BUCKET`, `BACKUP_ENCRYPTION_KEY` (≥ 16 ký tự, `openssl rand -base64 24`), tuỳ chọn `BACKUP_RETENTION_DAYS` (mặc định 30).
   **Cất `BACKUP_ENCRYPTION_KEY` ở nơi khác (trình quản lý mật khẩu). Mất khoá là không giải mã được bản sao lưu.**
4. `docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate backup-sync` rồi xem `... logs backup-sync` (“tải lên N”).

Mỗi giờ, các bản `.dump` mới được mã hoá (AES-256-GCM) rồi tải lên `backups/`; bản quá hạn bị xoá nhưng **luôn giữ ≥ 3 bản mới nhất**; lỗi tải lên thì không xoá gì. Ứng dụng từ chối chạy nếu `BACKUP_R2_BUCKET` trùng `R2_BUCKET` (tránh đưa sao lưu lên bucket công khai).

### 4. Khôi phục từ R2 (khi VPS hỏng)
Dựng lại stack trên VPS mới (cùng `.env`, đặc biệt `BACKUP_ENCRYPTION_KEY`), rồi:
```bash
C="docker compose -f docker-compose.prod.yml --env-file .env"
$C up -d db backup-sync
$C exec backup-sync node_modules/.bin/tsx scripts/fetch-backup.ts list                      # xem các bản
$C exec backup-sync node_modules/.bin/tsx scripts/fetch-backup.ts latest /backups/restore.dump
$C exec -T db pg_restore -U dalat -d dalat --clean --if-exists --no-owner < backups/restore.dump
$C up -d
```
Nên thử quy trình này 1 lần trên máy khác để chắc chắn khoá và R2 hoạt động, đừng đợi đến lúc cần.

### Ý nghĩa các cảnh báo
| Cảnh báo | Thường do | Xử lý |
|---|---|---|
| Web | container `web` sập / quá tải | `... logs --tail 80 web`, `... restart web` |
| Worker | worker sập, Redis lỗi | `... logs worker`, `... restart worker` |
| Giữ phòng quá hạn chưa nhả | worker không xử lý được job | xem log worker; restart |
| Sao lưu DB trên VPS | `backup-db` lỗi (mật khẩu DB đổi, hết đĩa) | `... logs backup-db` |
| Sao lưu ra ngoài (R2) | sai khoá/bucket, mất mạng | `... logs backup-sync` |
| Dung lượng đĩa | đầy đĩa (log Docker, backup) | dọn đĩa; `docker system df` |
