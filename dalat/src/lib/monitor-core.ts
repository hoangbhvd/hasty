/** Máy trạng thái cảnh báo: chỉ báo khi lỗi LIÊN TIẾP (tránh báo nhầm do 1 lần chập chờn), báo khi hồi phục, nhắc lại định kỳ. */
export type CheckResult = { name: string; ok: boolean; detail?: string };

export type CheckState = {
  consecutive: number;   // số lần lỗi liên tiếp
  alerted: boolean;      // đã gửi cảnh báo DOWN chưa
  since?: number;        // thời điểm lỗi đầu tiên của đợt này
  lastAlert?: number;    // lần gửi tin gần nhất (DOWN hoặc REMINDER)
};
export type State = Record<string, CheckState>;

export type Alert =
  | { kind: "DOWN"; name: string; detail?: string }
  | { kind: "REMINDER"; name: string; detail?: string; downForMs: number }
  | { kind: "RECOVERED"; name: string; downForMs: number };

export type Options = { threshold: number; reminderMs: number };
export const DEFAULTS: Options = { threshold: 2, reminderMs: 6 * 3600_000 };

export function step(prev: State, results: CheckResult[], now: number, opts: Options = DEFAULTS): { state: State; alerts: Alert[] } {
  const state: State = { ...prev };
  const alerts: Alert[] = [];
  for (const r of results) {
    const cur: CheckState = { ...(state[r.name] ?? { consecutive: 0, alerted: false }) };
    if (r.ok) {
      if (cur.alerted) alerts.push({ kind: "RECOVERED", name: r.name, downForMs: now - (cur.since ?? now) });
      state[r.name] = { consecutive: 0, alerted: false };
      continue;
    }
    if (cur.consecutive === 0) cur.since = now;
    cur.consecutive++;
    if (cur.consecutive >= opts.threshold) {
      if (!cur.alerted) {
        alerts.push({ kind: "DOWN", name: r.name, detail: r.detail });
        cur.alerted = true; cur.lastAlert = now;
      } else if (now - (cur.lastAlert ?? now) >= opts.reminderMs) {
        alerts.push({ kind: "REMINDER", name: r.name, detail: r.detail, downForMs: now - (cur.since ?? now) });
        cur.lastAlert = now;
      }
    }
    state[r.name] = cur;
  }
  return { state, alerts };
}

export const LABEL: Record<string, string> = {
  web: "Web (trang chính)", db: "Cơ sở dữ liệu", redis: "Redis", worker: "Worker (nhả phòng, nhắc lịch)",
  holds: "Giữ phòng quá hạn chưa được nhả", backup: "Sao lưu DB trên VPS", "backup-sync": "Sao lưu ra ngoài VPS (R2)",
  disk: "Dung lượng đĩa", queue: "Job nền bị lỗi",
};

export function duration(ms: number): string {
  if (ms < 60_000) return "dưới 1 phút";
  const m = Math.round(ms / 60_000);
  if (m < 120) return `${m} phút`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} giờ` : `${Math.round(h / 24)} ngày`;
}

export function formatAlert(a: Alert, host = "dalat"): string {
  const l = LABEL[a.name] ?? a.name;
  if (a.kind === "DOWN") return `🔴 [${host}] ${l} gặp sự cố${a.detail ? `\n${a.detail}` : ""}`;
  if (a.kind === "REMINDER") return `🔴 [${host}] ${l} vẫn chưa được khắc phục (đã ${duration(a.downForMs)})${a.detail ? `\n${a.detail}` : ""}`;
  return `🟢 [${host}] ${l} đã hoạt động lại (lỗi kéo dài ${duration(a.downForMs)} kể từ lúc phát hiện)`;
}
