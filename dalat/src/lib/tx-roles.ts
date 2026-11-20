/** Vai trò trong giao dịch & ai phải xác nhận (hàm thuần, dùng cả ở server lẫn giao diện). */
export type PayerRole = "GUEST" | "BROKER" | "HOST";
export type ReceiverRole = "BROKER" | "HOST" | "GUEST";
export type PartyRole = "HOST" | "BROKER";

/**
 * Bên phải XÁC NHẬN một giao dịch đang chờ:
 *  - Tiền chuyển cho Host/Broker → chính bên nhận xác nhận "đã nhận tiền".
 *  - Hoàn tiền cho KHÁCH → khách không dùng app nên không xác nhận được; bên TRẢ tiền hoàn xác nhận (đã chuyển).
 */
export function confirmerRole(t: { payerRole: PayerRole; receiverRole: ReceiverRole }): PartyRole | null {
  if (t.receiverRole === "GUEST") return t.payerRole === "GUEST" ? null : t.payerRole;
  return t.receiverRole;
}

export const isRefundToGuest = (t: { receiverRole: ReceiverRole }) => t.receiverRole === "GUEST";
