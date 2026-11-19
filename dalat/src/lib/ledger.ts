/**
 * Tài chính 2 lớp & đối soát công nợ (mục 4.3 spec). Hàm thuần — mọi số tiền là VND nguyên.
 *
 *  - Tiền khách phải trả  = guest_total + extra_fees + Σ(addon.guest_price × qty)
 *  - Hoa hồng Broker      = (guest_total − host_net) + Σ((addon.guest − addon.net) × qty)
 *  - Host được hưởng      = host_net + Σ(addon.net × qty) + extra_fees
 *  - Tiền mặt của Host    = Σ nhận (receiver=HOST) − Σ chi (payer=HOST)   [chỉ giao dịch CONFIRMED]
 *  - Công nợ (owedToHost) = Host được hưởng − Tiền mặt của Host
 *        > 0: Broker nợ Host (cọc/net chưa chuyển)   < 0: Host nợ Broker (hoa hồng đang giữ)
 */
export type TxLite = {
  payerRole: "GUEST" | "BROKER" | "HOST";
  receiverRole: "BROKER" | "HOST";
  amount: number;
  status: "PENDING_CONFIRM" | "CONFIRMED" | "REJECTED";
};
export type AddonLite = { quantity: number; guestPrice: number; netPrice: number };
export type BookingFin = {
  guestTotalPrice: number;
  hostNetPrice: number;
  extraFees: number;
  cancelled: boolean;
  hasHost: boolean;
  hasBroker: boolean;
};

export type Ledger = {
  guestPayable: number;
  guestPaid: number;
  guestRemaining: number;
  addonsGuest: number;
  addonsNet: number;
  hostEntitled: number;
  commission: number;
  hostCash: number;
  brokerCash: number;
  /** >0 Broker nợ Host; <0 Host nợ Broker; 0 khi không áp dụng (thiếu 1 bên) */
  owedToHost: number;
  commissionRealized: number;
  commissionPending: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function ledger(b: BookingFin, addons: AddonLite[], txs: TxLite[]): Ledger {
  const ok = txs.filter((t) => t.status === "CONFIRMED");
  const sum = (f: (t: TxLite) => boolean) => ok.filter(f).reduce((s, t) => s + t.amount, 0);

  const addonsGuest = addons.reduce((s, a) => s + a.guestPrice * a.quantity, 0);
  const addonsNet = addons.reduce((s, a) => s + a.netPrice * a.quantity, 0);

  const guestPayable = b.guestTotalPrice + b.extraFees + addonsGuest;
  const guestPaid = sum((t) => t.payerRole === "GUEST");
  const hostEntitled = b.cancelled ? 0 : b.hostNetPrice + addonsNet + b.extraFees;
  const commission = b.cancelled ? 0 : b.guestTotalPrice - b.hostNetPrice + (addonsGuest - addonsNet);

  const hostCash = sum((t) => t.receiverRole === "HOST") - sum((t) => t.payerRole === "HOST");
  const brokerCash = sum((t) => t.receiverRole === "BROKER") - sum((t) => t.payerRole === "BROKER");

  let owedToHost = 0;
  let commissionRealized = 0;
  if (b.hasHost && b.hasBroker) {
    owedToHost = hostEntitled - hostCash;
    // Hoa hồng "đã nhận" = tiền Broker đang giữ vượt quá phần còn phải chuyển cho Host
    commissionRealized = clamp(brokerCash - Math.max(owedToHost, 0), 0, commission);
  } else if (b.hasBroker) {
    // Homestay ngoài app: Broker thu tiền khách và tự trả chủ nhà ngoài hệ thống
    commissionRealized = clamp(guestPaid - hostEntitled, 0, commission);
  } else {
    owedToHost = 0; // Host tự bán: không có Broker, không có công nợ
  }

  return {
    guestPayable, guestPaid, guestRemaining: guestPayable - guestPaid,
    addonsGuest, addonsNet, hostEntitled, commission, hostCash, brokerCash,
    owedToHost, commissionRealized, commissionPending: commission - commissionRealized,
  };
}
