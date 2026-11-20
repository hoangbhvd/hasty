/* eslint-disable @next/next/no-img-element */
const initials = (name: string) => name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

/** Avatar tròn; chưa có ảnh thì hiện chữ cái đầu trên nền secondary (Host) / primary (CTV). */
export function Avatar({ name, url, tone = "broker", size = 36 }: { name: string; url?: string | null; tone?: "host" | "broker"; size?: number }) {
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.38) };
  return url ? (
    <img src={url} alt={name} style={style} className="shrink-0 rounded-full border border-black object-cover" />
  ) : (
    <span aria-label={name} style={style} className={`grid shrink-0 place-items-center rounded-full border border-black font-bold text-black ${tone === "host" ? "bg-secondary" : "bg-primary"}`}>
      {initials(name)}
    </span>
  );
}

/** Ảnh đại diện căn (4:3). Không có ảnh: nền kem + ngôi nhà viền đen. */
export function PropertyCover({ url, name, className = "" }: { url?: string | null; name: string; className?: string }) {
  return (
    <div className={`aspect-[4/3] w-full overflow-hidden border border-black bg-[#F4F4F0] ${className}`}>
      {url ? (
        <img src={url} alt={name} loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center" aria-label={`${name} (chưa có ảnh)`}>
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" aria-hidden><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
        </div>
      )}
    </div>
  );
}
