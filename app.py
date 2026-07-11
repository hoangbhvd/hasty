import streamlit as st
from weasyprint import HTML
import io
import os
import base64

st.set_page_config(page_title="Cottown - Booking System", layout="wide")
st.title("Tạo Booking")

# Hàm mã hóa file ảnh sang base64 để hiển thị trong PDF ổn định
def get_base64_image(image_path):
    if os.path.exists(image_path):
        with open(image_path, "rb") as img_file:
            return "data:image/png;base64," + base64.b64encode(img_file.read()).decode('utf-8')
    return ""

# Hàm bóc tách ký tự số từ chuỗi văn bản để thực hiện tính toán
def parse_number_from_text(text_value):
    if not text_value:
        return 0
    # Loại bỏ các ký tự không phải là số (dấu chấm, dấu phẩy, chữ đ, VND...)
    clean_string = "".join(c for c in str(text_value) if c.isdigit())
    return int(clean_string) if clean_string else 0

# Hàm định dạng số thành chuỗi phân cách hàng nghìn bằng dấu chấm (VD: 1000000 -> 1.000.000)
def format_money(number_value):
    return f"{number_value:,.0f}".replace(",", ".")

# Form nhập liệu toàn bộ dạng TEXT cho bạn dễ custom ký tự nếu muốn
with st.form("booking_form"):
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown("Thông tin khách hàng")
        ten_khach = st.text_input("Tên khách hàng", value="")
        so_dien_thoai = st.text_input("Số điện thoại", value="")
        so_luong_khach = st.text_input("Số lượng khách", value="")
        check_in = st.text_input("Thời gian Check-in", value="")
        check_out = st.text_input("Thời gian Check-out", value="")

    with col2:
        st.markdown("Chi phí & Đặt cọc")
        txt_gia_1_dem = st.text_input("Giá 1 đêm", value="")
        txt_so_dem = st.text_input("Số đêm", value="")
        txt_da_coc = st.text_input("Đã cọc", value="")
        
    submit = st.form_submit_button("Tạo PDF")

if submit:
    # 1. Tự động bóc tách text sang số để tính toán
    num_gia_1_dem = parse_number_from_text(txt_gia_1_dem)
    num_so_dem = parse_number_from_text(txt_so_dem)
    num_da_coc = parse_number_from_text(txt_da_coc)
    
    # 2. Xử lý phép tính toán học
    num_thanh_tien = num_gia_1_dem * num_so_dem
    num_con_lai = num_thanh_tien - num_da_coc
    
    # 3. TỰ ĐỘNG CONVERT VÀ ÉP FORMAT ĐỊNH DẠNG ĐẸP (1.000.000) CHO TẤT CẢ CÁC BIẾN TIỀN
    f_gia_1_dem = format_money(num_gia_1_dem)
    f_thanh_tien = format_money(num_thanh_tien)
    f_da_coc = format_money(num_da_coc)
    f_con_lai = format_money(num_con_lai)

    try:
        # Mã hóa các hình ảnh cục bộ sang chuỗi dữ liệu base64
        logo_base64 = get_base64_image("logo-cottown.png")
        image_header_base64 = get_base64_image("image_header.JPG")
        image_qr_base64 = get_base64_image("image_qr_location.jpg")

        # Đọc file template riêng biệt của bạn
        with open("booking_template.html", "r", encoding="utf-8") as f:
            html_template = f.read()
        
        # Thay thế dữ liệu vào template HTML
        html_filled = html_template \
            .replace("logo-cottown.png", logo_base64) \
            .replace("image_header.JPG", image_header_base64) \
            .replace("image_qr_location.jpg", image_qr_base64) \
            .replace("{{TEN_KHACH}}", ten_khach.upper()) \
            .replace("{{SO_DIEN_THOAI}}", so_dien_thoai) \
            .replace("{{SO_LUONG_KHACH}}", so_luong_khach.upper()) \
            .replace("{{CHECK_IN}}", check_in.upper()) \
            .replace("{{CHECK_OUT}}", check_out.upper()) \
            .replace("{{SO_DEM}}", txt_so_dem) \
            .replace("{{GIA_1_DEM}}", f_gia_1_dem) \
            .replace("{{THANH_TIEN}}", f_thanh_tien) \
            .replace("{{DA_COC}}", f_da_coc) \
            .replace("{{CON_LAI}}", f_con_lai)

        # Biên dịch HTML thành dữ liệu PDF
        pdf_buffer = io.BytesIO()
        HTML(string=html_filled).write_pdf(pdf_buffer)
        pdf_buffer.seek(0)
        
        st.success("🎉 Đã định dạng tiền tệ và tạo file PDF thành công!")
        st.download_button(
            label="⬇️ Tải file PDF Booking (1 Trang)",
            data=pdf_buffer,
            file_name=f"Cottown_Booking_{ten_khach.replace(' ', '_')}.pdf",
            mime="application/pdf"
        )
    except FileNotFoundError:
        st.error("Không tìm thấy file 'booking_template.html'. Hãy đảm bảo tệp template này nằm chung thư mục với file app.py.")