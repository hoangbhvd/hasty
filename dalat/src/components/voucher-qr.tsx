"use client";

import { useState } from "react";

/** Ảnh VietQR (qua proxy cùng origin). Nếu tải lỗi thì ẩn đi để không làm hỏng việc xuất PNG. */
export function VoucherQr({ token, code }: { token: string; code: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="pt-2 text-center text-[11px]">Chưa tải được mã QR. Vui lòng liên hệ để nhận thông tin chuyển khoản · nội dung: <b className="font-mono">{code}</b></p>;
  return (
    <div className="pt-2 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/voucher/${token}/qr`} alt="Mã VietQR thanh toán" onError={() => setFailed(true)} className="mx-auto w-48 border border-black bg-white" />
      <p className="pt-1 text-[11px]">Quét mã để thanh toán phần còn lại · nội dung: <b className="font-mono">{code}</b></p>
    </div>
  );
}
