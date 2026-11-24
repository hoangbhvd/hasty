/** Màu nền theo trạng thái booking (dùng chung cho danh sách và các lịch). */
export const STATUS_STYLE: Record<string, string> = {
  HOLDING: "bg-status-holding",
  CONFIRMED: "bg-status-confirmed-bg",
  CHECKED_IN: "bg-status-checked-in",
  CHECKED_OUT: "bg-muted",
  CANCELLED: "bg-status-cancelled",
};
