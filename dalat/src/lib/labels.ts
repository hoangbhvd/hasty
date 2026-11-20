export const AREA_LABEL = {
  TRUNG_TAM: "Trung tâm (Chợ ĐL / Hồ Xuân Hương)",
  CAN_TRUNG_TAM: "Cận trung tâm (2–4km)",
  HUNG_VUONG_TRAI_MAT: "Hùng Vương – Trại Mát – Cầu Đất",
  TUYEN_LAM_PRENN_MIMOSA: "Hồ Tuyền Lâm – Đèo Prenn – Mimosa",
  AN_SON_TRIEU_VIET_VUONG: "An Sơn – Triệu Việt Vương – Đống Đa",
  TA_NUNG_CAM_LY: "Cam Ly – Tà Nùng",
  DA_PHU_LANGBIANG: "Đa Phú – Suối Vàng – Langbiang",
  KHAC: "Khu vực khác",
} as const;

export const ROAD_LABEL = {
  MOTORBIKE: "Chỉ xe máy",
  CAR_7: "Ô tô 7 chỗ",
  CAR_16: "Ô tô 16 chỗ",
  BUS_29: "Xe 29 chỗ",
} as const;

export const SLOPE_LABEL = {
  FLAT: "Đường bằng",
  MILD_SLOPE: "Dốc nhẹ",
  STEEP: "Dốc cao",
} as const;

export const TIER_LABEL = { STANDARD: "Standard", VIP: "VIP", AGENCY: "Agency" } as const;
export const LINK_STATUS_LABEL = { PENDING: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Đã từ chối", BLOCKED: "Đã chặn" } as const;

export const VIEW_OPTIONS = ["Đồi thông", "Thung lũng", "Thành phố", "Hồ", "Núi", "Vườn hoa"] as const;

export const enumOptions = <T extends Record<string, string>>(m: T) =>
  Object.entries(m).map(([value, label]) => ({ value, label }));

export const ACCESS_ROLE_LABEL = { BROKER: "CTV thường", CO_HOST: "Co-host (đồng quản lý)", CARETAKER: "Quản gia" } as const;
export const ACCESS_ROLE_HINT = {
  BROKER: "Giữ phòng 30 phút; chỉ thấy trạng thái lịch của người khác.",
  CO_HOST: "Chốt đơn ngay, xem đủ thông tin đơn, làm check-in/out. Không thấy giá Net của chủ nhà.",
  CARETAKER: "Xem lịch ra/vào, số tiền thu nốt, check-in/out/dọn phòng. Ẩn hoàn toàn giá Net và doanh thu.",
} as const;
