export const AREA_LABEL = {
  TRUNG_TAM: "Trung tâm",
  TUYEN_LAM: "Hồ Tuyền Lâm",
  TRAI_MAT: "Trại Mát",
  TA_NUNG: "Tà Nùng",
  DA_PHU: "Đa Phú",
  PHUONG_11: "Phường 11",
  KHAC: "Khác",
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
export const LINK_STATUS_LABEL = { PENDING: "Chờ duyệt", APPROVED: "Đã duyệt", BLOCKED: "Đã chặn" } as const;

export const VIEW_OPTIONS = ["Đồi thông", "Thung lũng", "Thành phố", "Hồ", "Núi", "Vườn hoa"] as const;

export const enumOptions = <T extends Record<string, string>>(m: T) =>
  Object.entries(m).map(([value, label]) => ({ value, label }));
