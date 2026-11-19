/** Ngân hàng phổ biến hỗ trợ VietQR (mã dùng trong URL img.vietqr.io). */
export const BANKS = [
  { id: "VCB", name: "Vietcombank" }, { id: "TCB", name: "Techcombank" }, { id: "MB", name: "MB Bank" },
  { id: "ACB", name: "ACB" }, { id: "VPB", name: "VPBank" }, { id: "BIDV", name: "BIDV" },
  { id: "CTG", name: "VietinBank" }, { id: "TPB", name: "TPBank" }, { id: "STB", name: "Sacombank" },
  { id: "VIB", name: "VIB" }, { id: "SHB", name: "SHB" }, { id: "OCB", name: "OCB" },
  { id: "MSB", name: "MSB" }, { id: "HDB", name: "HDBank" }, { id: "EIB", name: "Eximbank" },
  { id: "LPB", name: "LPBank" }, { id: "SEAB", name: "SeABank" }, { id: "ABB", name: "ABBANK" },
  { id: "VBA", name: "Agribank" },
] as const;

export const BANK_IDS: string[] = BANKS.map((b) => b.id);
