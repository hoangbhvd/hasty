import { formatVnd } from "@/lib/format";
import type { VoucherData } from "@/lib/voucher";

const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** Giá từng đêm; màu chữ kế thừa từ khối chứa. Không render nếu không có dữ liệu. */
export function NightlyList({ nightly, className = "" }: { nightly: VoucherData["nightly"]; className?: string }) {
  if (nightly.length === 0) return null;
  return (
    <dl className={`money-num space-y-0.5 ${className}`}>
      {nightly.map((n) => {
        const d = new Date(`${n.date}T00:00:00Z`);
        return (
          <div key={n.date} className="flex justify-between gap-3">
            <dt>{DOW[d.getUTCDay()]} {String(d.getUTCDate()).padStart(2, "0")}/{String(d.getUTCMonth() + 1).padStart(2, "0")}</dt>
            <dd>{formatVnd(n.amount)}</dd>
          </div>
        );
      })}
    </dl>
  );
}
