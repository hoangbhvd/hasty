import { Avatar } from "@/components/avatar";
import { BADGE_LABEL, type TrustStats } from "@/lib/broker-trust-core";

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** Hồ sơ năng lực CTV (spec 9.4): chỉ số tính từ đơn trên hệ thống, không phụ thuộc đơn tự nhập. */
export function BrokerTrustCard({ name, avatarUrl, phone, bio, stats }: { name: string; avatarUrl: string | null; phone: string | null; bio: string | null; stats: TrustStats }) {
  const cell = (label: string, value: string | number) => (
    <div className="rounded border border-black bg-white p-2 text-center">
      <div className="money-num text-lg font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
  return (
    <div className="space-y-3 rounded border border-black bg-[#F4F4F0] p-3">
      <div className="flex items-center gap-3">
        <Avatar name={name} url={avatarUrl} size={48} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{name}</div>
          <div className="text-sm text-muted-foreground">{phone ?? "—"}</div>
        </div>
        <span className="shrink-0 rounded border border-black bg-primary px-2 py-1 text-xs font-bold">{BADGE_LABEL[stats.badge]} · {stats.score}đ</span>
      </div>
      {bio && <p className="whitespace-pre-line text-sm">{bio}</p>}
      <div className="grid grid-cols-3 gap-2">
        {cell("Đơn thành công", stats.orders)}
        {cell("Khách đã đưa về", stats.guests)}
        {cell("Đêm đã bán", stats.nights)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {cell("Tỷ lệ hoàn thành", pct(stats.completionRate))}
        {cell("Tỷ lệ hủy", pct(stats.cancelRate))}
      </div>
      <p className="text-[11px] text-muted-foreground">Chỉ tính các đơn trên căn của chủ nhà trong hệ thống; không tính đơn CTV tự nhập.</p>
    </div>
  );
}
