# ĐẶC TẢ KỸ THUẬT: HỆ THỐNG THIẾT KẾ BOOKING CONFIRMATION (HYBRID VOUCHER STUDIO)

## 1. TỔNG QUAN
Mỗi Căn (`properties` — bao gồm cả `HOST_MANAGED` và `BROKER_EXTERNAL`) được phép tự thiết kế mẫu **Booking Confirmation (BC)** riêng bằng 1 trong 2 chế độ:
1. **Chế độ 1 (`TEMPLATE` — Nhanh, mặc định):** Dùng mẫu HTML/CSS dựng sẵn (có **Logo Homestay**, ảnh khung vòm cong, bảng giá 4 cột, 3 khối chính sách) và tùy biến trực tiếp trên web/mobile.
2. **Chế độ 2 (`CUSTOM_PDFME` — Tùy biến cao kiểu Canva):** Chủ nhà tự upload file PDF nền (1 trang A4) đã thiết kế sẵn trên Canva (đã có sẵn logo, khung ảnh, họa tiết riêng), sau đó kéo thả các ô biến động (`{{TEN_KHACH}}`, `{{CHECK_IN}}`, `{{DA_COC}}`...) vào đúng vị trí bằng thư viện **`pdfme`**.

Cả 2 chế độ đều hỗ trợ xuất **file PDF A4 chuẩn vector** và **ảnh PNG độ nét cao (gửi Zalo)** thông qua container **Gotenberg** chạy trên VPS.

---

## 2. CẬP NHẬT HẠ TẦNG VPS (`docker-compose.yml`)
Thêm service **Gotenberg** vào `docker-compose.yml` để render HTML/CSS sang PDF & PNG sắc nét (thay thế hoàn toàn `html-to-image` trên client để tránh lỗi font tiếng Việt và vỡ khung trên Safari/iPhone):

```yaml
services:
  gotenberg:
    image: gotenberg/gotenberg:8
    restart: unless-stopped
    environment:
      - TZ=Asia/Ho_Chi_Minh