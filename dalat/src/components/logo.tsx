import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo hmstay (nét vẽ, nền trong suốt, nét xám đậm). `onDark` đảo màu để đọc được trên nền đen (sidebar).
 * Kích thước 1184×622 (đã cắt lề trong suốt) — chỉ cần đặt chiều cao bằng className (vd "h-10").
 */
export function Logo({ className, onDark = false, priority = false }: { className?: string; onDark?: boolean; priority?: boolean }) {
  return (
    <Image
      src="/logo/hmstay.png" alt="hmstay" width={1184} height={622} priority={priority}
      className={cn("h-10 w-auto select-none", onDark && "invert", className)}
    />
  );
}
