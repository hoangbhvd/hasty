# PROJECT SPECIFICATION: DALAT HOMESTAY B2B2C & PMS WEBAPP

## 1. TỔNG QUAN DỰ ÁN & MỤC TIÊU
Xây dựng Webapp (Mobile-first PWA) kết nối **Chủ Homestay/Villa (Host)** và **Cộng tác viên/Môi giới bán phòng (Broker)**, tập trung triển khai giai đoạn đầu tại thị trường du lịch **Đà Lạt, Việt Nam**.

### Mục tiêu cốt lõi:
1. **Tài khoản hợp nhất (Unified Dual-Role):** 1 tài khoản duy nhất có thể chuyển đổi linh hoạt giữa **Chế độ Chủ nhà (Host Mode)** và **Chế độ CTV (Broker Mode)** (chủ nhà này có thể làm broker bán phòng cho chủ nhà khác).
2. **Quản lý tồn kho cha - con (Parent-Child Inventory):** Một Căn (Property) có thể bán **Nguyên căn** hoặc bán **Phòng lẻ**. Hệ thống bắt buộc phải tự động khóa chéo lịch và chống trùng lịch (overbooking) tuyệt đối.
3. **Hỗ trợ Homestay ngoài hệ thống (External Homestay):** Broker có thể tự tạo các homestay chưa tham gia app để tự ghi nhận đơn hàng, quản lý doanh số, hoa hồng, lịch check-in/out và xuất Booking Confirmation cho khách (không cần quản lý lịch trống hay chờ chủ duyệt).
4. **Tài chính 2 lớp & Đối soát công nợ:** Quản lý độc lập Giá bán cho khách (Guest Price), Giá chủ thu về (Host Net Price), Hoa hồng (Commission), Tiền cọc, Tiền còn lại và Công nợ thực tế giữa Host ↔ Broker.
5. **Giao tiếp gắn ngữ cảnh (Booking-centric Chat) & Tìm phòng gấp:** Mỗi booking có một luồng chat riêng tích hợp thẻ tương tác nhanh (Giữ phòng 30p, Duyệt bill cọc) + Bảng tin tìm phòng gấp cho thị trường Đà Lạt.

---

## 2. TECH STACK & HẠ TẦNG (SELF-HOSTED TRÊN VPS)
- **Framework:** Next.js (App Router) + TypeScript
- **UI/UX:** Tailwind CSS + `shadcn/ui` (Mobile-first, hỗ trợ PWA - Progressive Web App)
- **Database & ORM:** PostgreSQL + Prisma ORM
- **Real-time & Queue:** Custom Node/Next server tích hợp **Socket.io** (Chat real-time & cập nhật trạng thái booking) + **Redis + BullMQ** (Xử lý đếm ngược hết hạn giữ phòng 30 phút và nhắc lịch check-in tự động).
- **Authentication:** Better Auth (hoặc Auth.js) với PostgreSQL adapter (đăng nhập SĐT/Email/Google).
- **File Storage:** Cloudflare R2 (S3-compatible API) để lưu kho ảnh/video sạch và ảnh bill chuyển khoản.
- **Thông báo ngoài app:** Telegram Bot API (giai đoạn MVP) + Web Push (PWA).
- **Tiện ích:** `html-to-image` (xuất ảnh Booking Confirmation PNG trên client), VietQR image API (`https://img.vietqr.io/...`).
- **Deployment:** Docker + Docker Compose (triển khai qua Coolify/Dokploy trên VPS). Bắt buộc cấu hình múi giờ `TZ=Asia/Ho_Chi_Minh` cho toàn bộ container (App, PostgreSQL, Redis).

---

## 3. KIẾN TRÚC DATABASE (PRISMA / POSTGRESQL)

Thiết kế đầy đủ các nhóm bảng sau:

### 3.1. Users & Network
- `users`: `id` (UUID), `phone` (unique), `email`, `password_hash`, `full_name`, `avatar_url`, `is_host` (bool), `is_broker` (bool), `bank_id` (mã ngân hàng VietQR), `bank_account_no`, `bank_account_name`, `telegram_chat_id`, `created_at`.
- `host_broker_links`: `id`, `host_id` (FK), `broker_id` (FK), `tier` (ENUM: `STANDARD`, `VIP`, `AGENCY`), `status` (ENUM: `PENDING`, `APPROVED`, `BLOCKED`).

### 3.2. Properties, Rooms & Đặc thù Đà Lạt
- `properties`:
  - `id`, `source_type` (ENUM: `HOST_MANAGED`, `BROKER_EXTERNAL`).
  - `host_id` (FK -> `users`, **nullable** nếu là `BROKER_EXTERNAL`).
  - `created_by_broker_id` (FK -> `users`, **nullable**, dùng cho `BROKER_EXTERNAL` - chỉ hiển thị riêng cho broker này).
  - `external_host_name`, `external_host_phone` (dùng cho `BROKER_EXTERNAL`).
  - `name`, `description`, `allow_whole_unit` (bool), `allow_individual_rooms` (bool).
  - **Thuộc tính chuẩn Đà Lạt:**
    - `area` (ENUM: `TRUNG_TAM`, `TUYEN_LAM`, `TRAI_MAT`, `TA_NUNG`, `DA_PHU`, `PHUONG_11`, `KHAC`).
    - `distance_to_market_km` (Float - khoảng cách tới Chợ Đà Lạt).
    - `road_access` (ENUM: `MOTORBIKE`, `CAR_7`, `CAR_16`, `BUS_29`).
    - `slope_level` (ENUM: `FLAT`, `MILD_SLOPE`, `STEEP`).
    - `amenities` (JSONB: `{ bbQ, ac, pet_friendly, karaoke, views: string[] }`).
  - **Vận hành:** `google_maps_url`, `checkin_guide`, `caretaker_phone`, `house_rules`.
  - **Giá Net cơ bản (Nguyên căn):** `base_weekday_net` (Đêm CN - T5), `base_weekend_net` (Đêm T6 - T7).
- `rooms`: `id`, `property_id` (FK), `name`, `max_guests`, `base_weekday_net`, `base_weekend_net`.
- `property_media`: `id`, `property_id` (FK), `room_id` (FK, nullable), `url`, `media_type` (`IMAGE`, `VIDEO`), `sort_order`.
- `special_prices`: `id`, `property_id`, `room_id` (nullable), `date` (DATE), `net_price`, `broker_tier` (nullable).

### 3.3. Bookings, Add-ons & Transactions
- `bookings`:
  - `id`, `booking_code` (unique, VD: `DL-2611-889`), `voucher_token` (UUID unique cho link public).
  - `property_id` (FK), `host_id` (FK, nullable), `broker_id` (FK, nullable).
  - `booking_type` (ENUM: `WHOLE_UNIT`, `ROOMS`, `EXTERNAL_MANUAL`).
  - `manual_room_info` (TEXT, nullable - dùng cho `BROKER_EXTERNAL`).
  - `check_in` (DATE), `check_out` (DATE).
  - `guest_name`, `guest_phone`, `guest_count`, `guest_note`.
  - `status` (ENUM: `HOLDING`, `CONFIRMED`, `CHECKED_IN`, `CHECKED_OUT`, `CANCELLED`).
  - `hold_expires_at` (TIMESTAMP, nullable).
  - **Tài chính:** `guest_total_price` (Decimal), `host_net_price` (Decimal), `extra_fees` (Decimal, default 0), `commission_amount` (Decimal).
- `booking_rooms`: `booking_id` (FK), `room_id` (FK).
- `booking_addons`: `id`, `booking_id` (FK), `service_name` (VD: Thuê xe máy, Set BBQ, Xe sân bay), `quantity`, `guest_price`, `net_price`.
- `transactions`:
  - `id`, `booking_id` (FK).
  - `payer_role` (ENUM: `GUEST`, `BROKER`, `HOST`).
  - `receiver_role` (ENUM: `BROKER`, `HOST`).
  - `amount` (Decimal).
  - `tx_type` (ENUM: `DEPOSIT`, `BALANCE`, `COMMISSION_SETTLEMENT`, `REFUND`).
  - `bill_image_url` (nullable).
  - `status` (ENUM: `PENDING_CONFIRM`, `CONFIRMED`, `REJECTED`).
  - `created_at`, `confirmed_at`.

### 3.4. Chat & Room Request Broadcast
- `conversations`: `id`, `booking_id` (FK, nullable - nếu có là chat theo đơn), `host_id`, `broker_id`, `last_message_at`.
- `messages`: `id`, `conversation_id` (FK), `sender_id` (FK), `msg_type` (ENUM: `TEXT`, `IMAGE`, `ACTION_HOLD_REQ`, `ACTION_BILL_UPLOAD`, `ACTION_MEDIA_PACK`), `content`, `metadata` (JSONB), `created_at`.
- `room_requests`: `id`, `broker_id` (FK), `check_in`, `check_out`, `guest_count`, `area`, `road_access`, `max_budget`, `note`, `status` (`OPEN`, `CLOSED`), `expires_at`.
- `room_request_offers`: `id`, `request_id` (FK), `host_id` (FK), `property_id` (FK), `offered_net_price`, `note`, `created_at`.

---

## 4. CÁC LUỒNG NGHIỆP VỤ BẮT BUỘC (CORE BUSINESS LOGIC)

### 4.1. Logic Khóa chéo lịch & Chống Overbooking (Critical)
Áp dụng cho `source_type = HOST_MANAGED`. Một booking được coi là **đang chiếm lịch** khi:
`status IN ('CONFIRMED', 'CHECKED_IN') OR (status = 'HOLDING' AND hold_expires_at > NOW())`
và giao thời gian: `(check_in < req_check_out AND check_out > req_check_in)`.

- **Đặt `WHOLE_UNIT`:** Không được tồn tại BẤT KỲ booking chiếm lịch nào thuộc `property_id` đó (dù là `WHOLE_UNIT` hay `ROOMS`).
- **Đặt `ROOMS` (danh sách `room_ids`):** Không được tồn tại booking `WHOLE_UNIT` của `property_id` đó VÀ không được tồn tại booking `ROOMS` chứa bất kỳ `room_id` nào trong danh sách.
- **Concurrency Control:** Khi tạo booking hoặc giữ phòng (`HOLDING`), bắt buộc chạy trong **PostgreSQL Transaction** và lock dòng `properties` bằng `SELECT id FROM properties WHERE id = $1 FOR UPDATE` trước khi kiểm tra trùng lịch và insert.

### 4.2. Cơ chế Giữ phòng 30 phút (Soft Hold)
- Khi Broker bấm "Giữ phòng", tạo booking trạng thái `HOLDING`, `hold_expires_at = NOW() + 30 minutes`, đồng thời đẩy 1 delayed job vào BullMQ (delay 30 phút).
- Khi job chạy: nếu booking vẫn ở trạng thái `HOLDING`, tự động đổi sang `CANCELLED`, ghi 1 tin nhắn hệ thống vào khung chat booking và bắn thông báo cho 2 bên.

### 4.3. Tính toán Tài chính & Công nợ
- **Tiền khách đã cọc/trả:** Tổng `transactions.amount` với `payer_role = 'GUEST'` và `status = 'CONFIRMED'`.
- **Tiền khách còn phải trả lúc check-in:** `(guest_total_price + extra_fees + tổng guest_price của addons) - (Tiền khách đã trả)`.
- **Hoa hồng Broker:** `(guest_total_price - host_net_price) + tổng (addon.guest_price - addon.net_price)`.
- **Đối soát Host ↔ Broker:** Tính dựa trên số tiền thực tế Host đã nhận (`receiver_role = 'HOST'`, `status = 'CONFIRMED'`) trừ đi tổng `host_net_price` (+ phần net của addons/phụ thu thuộc về Host) để ra số dư công nợ (Host nợ hoa hồng Broker hoặc Broker nợ tiền cọc Host).

### 4.4. Luồng Homestay ngoài hệ thống (`BROKER_EXTERNAL`)
- Không chạy kiểm tra trùng lịch, không cần `rooms`.
- Tạo booking vào thẳng trạng thái `CONFIRMED`.
- Giao dịch (`transactions`) do Broker tự nhập và tự động `CONFIRMED`.
- Vẫn hiển thị chung trên Lịch Check-in/out của Broker, Báo cáo hoa hồng, nhắc lịch 24h và tạo được Public Voucher gửi khách.

### 4.5. Trang Booking Confirmation công khai (`/voucher/[voucher_token]`)
- Không yêu cầu đăng nhập.
- **Bảo mật tuyệt đối:** API trả về cho trang này **KHÔNG ĐƯỢC** chứa `host_net_price`, `commission_amount`, hay công nợ nội bộ.
- Hiển thị: Tên Homestay, Hạng phòng/Nguyên căn, Ngày Check-in/out, Số khách, Dịch vụ đi kèm, Tổng tiền khách trả, Đã cọc, Còn lại cần thanh toán + mã VietQR động, nút mở Google Maps, hướng dẫn đường đi, SĐT hỗ trợ (Broker/Quản gia).
- Có nút **[Tải ảnh xác nhận (PNG)]** sử dụng `html-to-image`.

---

## 5. LỘ TRÌNH THỰC HIỆN TỪNG GIAI ĐOẠN (EXECUTION PHASES)

Hãy thực hiện tuần tự từng Phase, kiểm tra chạy ổn định rồi mới sang Phase tiếp theo:

### Phase 1: Khởi tạo Dự án, Hạ tầng Docker & Auth
1. Khởi tạo Next.js (App Router, TypeScript), Tailwind CSS, `shadcn/ui`, Prisma ORM.
2. Viết `docker-compose.yml` gồm: `postgres` (TZ=Asia/Ho_Chi_Minh), `redis`, và cấu hình `.env.example` (DB, Redis, Cloudflare R2, Telegram Bot Token).
3. Triển khai đầy đủ `schema.prisma` theo Mục 3 và chạy migration.
4. Làm hệ thống Đăng nhập/Đăng ký + Layout chung (Mobile-first Bottom Nav + Desktop Sidebar) + **Role Switcher** (`Host Mode` ⇄ `Broker Mode`).

### Phase 2: Quản lý Kho phòng Đà Lạt & Media
1. **Host Mode:** CRUD Properties (kèm toàn bộ bộ thuộc tính Đà Lạt), CRUD Rooms, Cấu hình giá ngày thường (CN-T5) / cuối tuần (T6-T7) / ngày lễ (`special_prices`).
2. Tích hợp Upload/Xóa ảnh & video lên Cloudflare R2 (có nút tải nhanh ảnh sạch cho Broker).
3. **Broker Mode:** Tính năng `+ Thêm Homestay ngoài` (`BROKER_EXTERNAL`) siêu gọn trong 1 modal.
4. Quản lý liên kết đối tác (`host_broker_links`): tạo link mời Broker, duyệt & phân hạng đối tác.

### Phase 3: Lịch vận hành, Tìm phòng & Luồng Booking cốt lõi
1. **API kiểm tra phòng trống & Tạo Booking:** Cài đặt Transaction + `SELECT FOR UPDATE` khóa chéo Nguyên căn/Phòng lẻ.
2. **Host Mode:** Lịch Timeline ngang (Gantt Calendar) hiển thị trực quan Căn -> Phòng lẻ và trạng thái khóa chéo; tạo booking thủ công (khách lẻ/OTA).
3. **Broker Mode:** Màn hình Tìm phòng trống theo ngày + Bộ lọc chuẩn Đà Lạt -> Bấm **[Giữ phòng 30p]** hoặc **[Tạo Booking]** (hỗ trợ cả căn trên app và căn ngoài app).
4. Cài đặt **BullMQ** worker xử lý tự động nhả phòng sau 30 phút và nhắc lịch trước 24h check-in.

### Phase 4: Booking Confirmation, Tài chính & Công nợ
1. Xây dựng trang công khai `/voucher/[voucher_token]` (che giá Net, tích hợp VietQR động, xuất ảnh PNG).
2. Màn hình Chi tiết Booking cho 2 vai trò: Thêm dịch vụ đi kèm (`booking_addons`), phụ thu check-out (`extra_fees`), ghi nhận giao dịch (`transactions`) kèm ảnh bill chuyển khoản.
3. Dashboard Tài chính & Đối soát công nợ cho Host (Doanh thu, Tiền cọc, Công nợ từng Broker) và Broker (Doanh số, Hoa hồng đã nhận/chờ nhận theo từng Homestay).

### Phase 5: Giao tiếp Real-time, Tìm phòng gấp & Thông báo
1. Tích hợp **Socket.io** vào server.
2. Xây dựng **Booking-centric Chat** với các thẻ tương tác nhanh (`ACTION_HOLD_REQ`, `ACTION_BILL_UPLOAD`, `ACTION_MEDIA_PACK`).
3. Xây dựng **Bảng tin Tìm phòng gấp** (`room_requests` & `room_request_offers`) tự động lọc và thông báo đến Host có căn trống khớp tiêu chí.
4. Tích hợp **Telegram Bot** bắn thông báo kèm deep link mở thẳng booking/chat và cấu hình **PWA** (manifest, service worker).

---

## 6. QUY TẮC CODE DÀNH CHO CLAUDE
- Luôn ưu tiên thiết kế **Mobile-first** (trên điện thoại dùng dễ như app native, các nút hành động chính đặt ở tầm ngón tay cái).
- Mọi thao tác đọc/ghi dữ liệu đều phải kiểm tra phân quyền chặt chẽ (Host chỉ sửa được căn của mình; Broker chỉ thấy `BROKER_EXTERNAL` do chính mình tạo; khách xem Voucher không bao giờ nhận được dữ liệu giá Net từ API).
- Xử lý ngày tháng thống nhất theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`), tránh lỗi lệch 1 ngày do UTC khi lưu `DATE` check-in/check-out.
- Trước khi bắt đầu mỗi Phase, hãy tóm tắt ngắn gọn danh sách file sẽ tạo/sửa rồi mới tiến hành code.