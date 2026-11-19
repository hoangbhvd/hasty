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
- **Sao lưu DB:** tự động mỗi 24 giờ vào `dalat/backups/*.dump`, giữ 7 ngày. Khôi phục:
  `docker compose -f docker-compose.prod.yml --env-file .env exec -T db pg_restore -U dalat -d dalat --clean --if-exists < backups/<file>.dump`
  (nên copy thư mục `backups/` ra ngoài VPS định kỳ).
- **Worker** phải luôn chạy: thiếu nó thì giữ phòng 30 phút không tự nhả (booking hết hạn vẫn không chặn lịch, nhưng không có tin nhắn/thông báo) và không có nhắc check-in.
- **Quay lui:** `git checkout <commit-cũ> && ./deploy/update.sh` (migration chỉ tiến, không tự lùi — hãy sao lưu trước khi cập nhật bản có migration mới).
