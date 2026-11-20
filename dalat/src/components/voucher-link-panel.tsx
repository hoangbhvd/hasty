"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { ActionButton } from "@/components/action-button";
import { regenerateVoucherLinkAction, setVoucherExpiryAction } from "@/app/(app)/voucher-actions";

const OPTIONS = [
  { days: 0, label: "Không giới hạn" },
  { days: 1, label: "1 ngày" },
  { days: 7, label: "7 ngày" },
  { days: 30, label: "30 ngày" },
];

export function VoucherLinkPanel({
  bookingId, url, expiresAt, expired, guestName, propertyName, code,
}: { bookingId: string; url: string; expiresAt: string | null; expired: boolean; guestName: string; propertyName: string; code: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const message = `Chào ${guestName}, đây là xác nhận đặt phòng ${code} tại ${propertyName}:\n${url}`;

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Xác nhận đặt phòng", text: message });
      else { await navigator.clipboard.writeText(message); window.alert("Đã chép lời nhắn kèm link. Dán vào Zalo để gửi khách."); }
    } catch { /* người dùng đóng hộp thoại chia sẻ */ }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input readOnly value={url} aria-label="Link voucher" className="brutal-input h-10 min-w-0 flex-1 bg-muted px-2 text-sm" />
        <CopyButton text={url} />
        <a href={url} target="_blank" rel="noopener noreferrer" className="brutal-btn inline-flex h-10 items-center bg-primary px-3 text-sm text-black">Mở</a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={share} className="brutal-btn inline-flex h-9 items-center bg-white px-3 text-sm text-black">📤 Gửi khách (Zalo…)</button>
        <CopyButton text={message} />
        <span className="text-xs text-muted-foreground">← chép lời nhắn kèm link</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-black/20 pt-2 text-sm">
        <label htmlFor="vexp" className="font-medium">Hiệu lực link</label>
        <select
          id="vexp" disabled={pending} defaultValue="" className="brutal-input h-9 bg-white px-2 text-sm"
          onChange={(e) => {
            const days = Number(e.target.value);
            setError(undefined);
            start(async () => {
              const r = await setVoucherExpiryAction(bookingId, days);
              if (r?.error) setError(r.error); else router.refresh();
            });
          }}
        >
          <option value="" disabled>Đặt hạn từ bây giờ…</option>
          {OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}
        </select>
        <span className={expired ? "font-semibold text-red-700" : "text-muted-foreground"}>
          {expiresAt ? `${expired ? "Đã hết hạn" : "Hết hạn"} lúc ${new Date(expiresAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}` : "Hiện không giới hạn"}
        </span>
      </div>
      <ActionButton
        action={regenerateVoucherLinkAction.bind(null, bookingId)}
        confirm="Tạo link mới? Link cũ (kể cả đã gửi cho khách) sẽ ngừng hoạt động ngay."
      >
        🔄 Tạo link mới (vô hiệu link cũ)
      </ActionButton>
      {error && <p role="alert" className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
