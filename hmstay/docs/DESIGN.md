# HMStay – Thiết kế

Nền tảng trung gian giữa **chủ homestay / khách sạn nhỏ** và **broker / CTV**.
Stack: Next.js + Postgres tự chạy trên VPS bằng Docker (không dùng Supabase). Phạm vi MVP: lõi đặt phòng, chưa có thanh toán online.

## Nguyên tắc
- **Một tài khoản, hai vai trò.** Không có cột `role`. Có `properties` → là chủ. Có `broker_links` active → là broker. UI có công tắc "Chế độ Chủ / Chế độ Broker".
- **Chủ duyệt từng broker.** Broker gửi yêu cầu hợp tác (`pending`), chủ duyệt (`active`) mới xem được phòng và giá net.
- **Giá net là bí mật theo broker.** Chủ đặt giá net mặc định hoặc riêng từng broker (`net_rates`), tách ngày thường / cuối tuần, có giá sàn tuỳ chọn. Broker tự định giá bán, hệ thống lưu `net_total` và `sell_total`; chênh lệch là phần của broker.
- **Phòng hoặc nguyên căn.** `properties.rental_mode`: `room` → nhiều `units` (từng phòng); `whole` → đúng 1 unit đại diện cả căn.
- **Chống trùng lịch bằng DB.** Exclusion constraint trên `(unit_id, daterange)` cho các trạng thái chiếm phòng, nên hai broker không thể giữ cùng một đêm.

## Luồng booking
```
Broker kiểm tra lịch (unit_busy_ranges) → báo giá cho khách
  quoted            báo giá, chưa giữ chỗ
  → holding         khách đồng ý đặt cọc, broker bấm "Báo chủ chốt": giữ chỗ 12h, chủ nhận thông báo
  → deposit_reported broker báo đã nhận cọc
  → confirmed       chủ chốt (hoặc cancelled)
  expired           hết hạn giữ chỗ mà chưa xác nhận (expire_holds, pg_cron)
```
Mọi chuyển trạng thái đi qua RPC `advance_booking`, kiểm tra quyền, ghi `booking_events`, tạo `notifications`.

## Màn hình MVP
**Chế độ chủ**: danh sách cơ sở → phòng → bảng giá net; duyệt broker; lịch từng phòng; hàng chờ chốt (holding / deposit_reported); chủ tự khoá lịch.
**Chế độ broker**: tìm cơ sở & xin hợp tác; xem phòng trống theo ngày + giá net; tạo báo giá (nhập giá bán, copy/gửi khách); nút "Báo chủ chốt"; danh sách booking và hoa hồng dự kiến.

## Ngoài MVP
Thanh toán online, đối soát hoa hồng tự động, xuất PDF báo giá/booking (tái dùng `booking_template.html` của Cottown), đồng bộ iCal với Airbnb/Booking, thông báo Zalo/email.

## Chạy trên VPS
- `docker-compose.yml`: `db` (Postgres 16, schema nạp từ `db/init/`), `backup` (pg_dump hằng ngày vào `./backups`), `expirer` (hết hạn giữ chỗ mỗi 5 phút, thay pg_cron). Thêm `web` và `caddy` khi dựng app.
- App kết nối bằng role `app_user` (không superuser, không bypass RLS). **Mỗi transaction phải gọi** `select set_config('app.user_id', '<uuid>', true)` trước khi query, nếu không RLS trả về rỗng.
- Đăng ký/đăng nhập qua hàm `register_user` / `find_user_for_login`; băm mật khẩu (argon2) và phiên (JWT/cookie) làm ở Next.js.
- Ảnh: file lưu ở volume `uploads/` hoặc Cloudflare R2, DB chỉ giữ `storage_key` trong `property_images`. Nên nén về WebP khoảng 200–400KB khi upload.
- Cần tự rsync `./backups` ra ngoài VPS (máy khác hoặc R2).
