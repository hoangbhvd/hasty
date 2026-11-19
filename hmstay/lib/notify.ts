import { pool } from "./db";
import { sendMail } from "./mail";

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Gửi các thông báo chưa gửi qua email. Gửi lỗi thì trả lại hàng đợi (tối đa 3 lần thử). */
export async function flushNotificationEmails() {
  const { rows } = await pool.query("select * from claim_notification_emails(20)");
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  for (const r of rows as { id: string; email: string; full_name: string; message: string; link_role: "owner" | "broker" }[]) {
    const link = `${base}/${r.link_role}/bookings`;
    try {
      await sendMail(
        r.email,
        `[hmstay] ${r.message.length > 90 ? r.message.slice(0, 87) + "..." : r.message}`,
        `Chào ${r.full_name || "bạn"},\n\n${r.message}\n\nXem chi tiết: ${link}\n\nBạn có thể tắt email thông báo tại ${base}/settings`,
        `<p>Chào ${esc(r.full_name || "bạn")},</p><p>${esc(r.message)}</p><p><a href="${link}">Xem chi tiết</a></p><p style="color:#64748b;font-size:12px">Bạn có thể tắt email thông báo ở <a href="${base}/settings">Cài đặt</a>.</p>`,
      );
    } catch (e) {
      console.error("[notify] gửi lỗi, sẽ thử lại:", r.email, e);
      await pool.query("select release_notification_email($1)", [r.id]);
    }
  }
}
