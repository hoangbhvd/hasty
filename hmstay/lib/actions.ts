"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { withUser } from "./db";
import { flushNotificationEmails } from "./notify";
import { endSession, loginUser, registerUser, requestPasswordReset, requireUser, resetPassword, startSession } from "./auth";
import { nightsBetween, priceStay, validDate } from "./format";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function friendly(e: any): string {
  if (e?.code === "23P01") return "Phòng đã có người giữ trong khoảng ngày này.";
  if (e?.code === "23505") return "Dữ liệu đã tồn tại.";
  if (e?.code === "42501") return "Bạn không có quyền thực hiện thao tác này.";
  if (e?.name === "ZodError") return "Dữ liệu nhập chưa hợp lệ.";
  return e?.message ?? "Có lỗi xảy ra.";
}

/** Chạy action; lỗi thì quay lại trang với ?e=thông báo. redirect() phải nằm NGOÀI try. */
async function run(back: string, fn: () => Promise<void>) {
  let err: string | null = null;
  try { await fn(); } catch (e) { err = friendly(e); }
  if (err) redirect(`${back}${back.includes("?") ? "&" : "?"}e=${encodeURIComponent(err)}`);
  revalidatePath(back.split("?")[0]);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const n = Number(String(f.get(k) ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// ───────── Tài khoản ─────────
export async function registerAction(f: FormData) {
  const d = z.object({
    email: z.string().email(), password: z.string().min(8), name: z.string().min(1),
  }).safeParse({ email: str(f, "email"), password: str(f, "password"), name: str(f, "name") });
  if (!d.success) redirect("/register?e=" + encodeURIComponent("Email hợp lệ, họ tên và mật khẩu từ 8 ký tự là bắt buộc."));
  let uid: string | null = null; let err: string | null = null;
  try { uid = await registerUser(d.data.email, d.data.password, d.data.name, str(f, "phone")); }
  catch (e) { err = friendly(e).includes("tồn tại") ? "Email đã được đăng ký." : friendly(e); }
  if (err || !uid) redirect("/register?e=" + encodeURIComponent(err ?? "Lỗi"));
  await startSession(uid);
  redirect("/");
}

export async function loginAction(f: FormData) {
  const uid = await loginUser(str(f, "email"), String(f.get("password") ?? ""));
  if (!uid) redirect("/login?e=" + encodeURIComponent("Sai email hoặc mật khẩu."));
  await startSession(uid);
  redirect("/");
}

export async function forgotPasswordAction(f: FormData) {
  const email = z.string().email().safeParse(str(f, "email"));
  if (!email.success) redirect("/forgot?e=" + encodeURIComponent("Nhập email hợp lệ."));
  // Gửi mail lỗi (SMTP sai...) chỉ ghi log, người dùng luôn thấy cùng một thông báo
  try { await requestPasswordReset(email.data); } catch (e) { console.error("[forgot]", e); }
  redirect("/forgot?sent=1");
}

export async function resetPasswordAction(f: FormData) {
  const token = str(f, "token");
  const pw = String(f.get("password") ?? "");
  const back = `/reset?token=${encodeURIComponent(token)}`;
  if (pw.length < 8) redirect(back + "&e=" + encodeURIComponent("Mật khẩu tối thiểu 8 ký tự."));
  if (pw !== String(f.get("password2") ?? "")) redirect(back + "&e=" + encodeURIComponent("Hai mật khẩu không khớp."));
  const ok = await resetPassword(token, pw);
  if (!ok) redirect("/forgot?e=" + encodeURIComponent("Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới."));
  redirect("/login?ok=" + encodeURIComponent("Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới."));
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

// ───────── Chủ: cơ sở, phòng, giá ─────────
export async function createPropertyAction(f: FormData) {
  const uid = await requireUser();
  let id = "";
  await run("/owner", async () => {
    const name = str(f, "name");
    if (!name) throw new Error("Nhập tên cơ sở.");
    const mode = str(f, "rental_mode") === "whole" ? "whole" : "room";
    const type = str(f, "type") === "hotel" ? "hotel" : "homestay";
    id = await withUser(uid, async (q) => {
      const [p] = await q<{ id: string }>(
        "insert into properties(owner_id,name,type,rental_mode,address,description) values ($1,$2,$3,$4,$5,$6) returning id",
        [uid, name, type, mode, str(f, "address") || null, str(f, "description") || null]);
      // Nguyên căn: tạo sẵn 1 unit đại diện
      if (mode === "whole") await q("insert into units(property_id,name,capacity) values ($1,$2,$3)", [p.id, "Nguyên căn", num(f, "capacity") || 2]);
      return p.id;
    });
  });
  redirect(`/owner/${id}`);
}

export async function addUnitAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}`, async () => {
    const name = str(f, "name");
    if (!name) throw new Error("Nhập tên phòng.");
    await withUser(uid, (q) => q("insert into units(property_id,name,capacity) values ($1,$2,$3)", [pid, name, num(f, "capacity") || 2]));
  });
}

export async function saveRateAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}`, async () => {
    const wd = num(f, "weekday"), we = num(f, "weekend");
    if (!wd) throw new Error("Nhập giá net ngày thường.");
    await withUser(uid, (q) => q(
      `insert into net_rates(unit_id,broker_id,weekday_price,weekend_price,min_sell_price)
       values ($1,$2,$3,$4,$5)
       on conflict (unit_id, broker_id) do update
         set weekday_price=excluded.weekday_price, weekend_price=excluded.weekend_price, min_sell_price=excluded.min_sell_price`,
      [str(f, "unit_id"), str(f, "broker_id") || null, wd, we || wd, num(f, "min_sell") || null]));
  });
}

export async function setLinkStatusAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}`, async () => {
    const status = str(f, "status");
    if (!["active", "rejected", "revoked"].includes(status)) throw new Error("Trạng thái không hợp lệ.");
    await withUser(uid, (q) => q("update broker_links set status=$1, commission_note=coalesce(nullif($2,''),commission_note) where id=$3",
      [status, str(f, "note"), str(f, "link_id")]));
  });
}

export async function blockDatesAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}`, async () => {
    const a = str(f, "check_in"), b = str(f, "check_out");
    if (!validDate(a) || !validDate(b) || nightsBetween(a, b) < 1) throw new Error("Ngày không hợp lệ.");
    await withUser(uid, (q) => q(
      "insert into bookings(unit_id,broker_id,guest_name,check_in,check_out,status,note) values ($1,null,$2,$3,$4,'confirmed',$5)",
      [str(f, "unit_id"), str(f, "guest_name") || "Chủ khoá lịch", a, b, str(f, "note") || null]));
  });
}

// ───────── Ảnh ─────────
export async function uploadImageAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}`, async () => {
    const files = f.getAll("images").filter((x): x is File => x instanceof File && x.size > 0);
    if (!files.length) throw new Error("Chọn ít nhất một ảnh.");
    for (const file of files) {
      if (file.size > 15 * 1024 * 1024) throw new Error("Ảnh tối đa 15MB.");
      const key = `properties/${pid}/${randomUUID()}.webp`;
      // Nén về WebP, cạnh dài tối đa 1600px, ~200-400KB
      const buf = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 75 }).toBuffer();
      // Ghi DB trước: RLS từ chối nếu không phải chủ => không để file mồ côi
      await withUser(uid, (q) => q(
        "insert into property_images(property_id,unit_id,storage_key) values ($1,$2,$3)",
        [pid, str(f, "unit_id") || null, key]));
      const full = path.join(UPLOAD_DIR, key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, buf);
    }
  });
}

export async function deleteImageAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}`, async () => {
    const rows = await withUser(uid, (q) => q<{ storage_key: string }>(
      "delete from property_images where id=$1 returning storage_key", [str(f, "image_id")]));
    for (const r of rows) await fs.rm(path.join(UPLOAD_DIR, r.storage_key), { force: true });
  });
}

// ───────── Broker ─────────
export async function requestLinkAction(f: FormData) {
  const uid = await requireUser();
  await run("/broker", async () => {
    await withUser(uid, (q) => q("insert into broker_links(property_id,broker_id) values ($1,$2)", [str(f, "property_id"), uid]));
  });
}

export async function createQuoteAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  const a = str(f, "check_in"), b = str(f, "check_out");
  const back = `/broker/${pid}?in=${a}&out=${b}`;
  await run(back, async () => {
    if (!validDate(a) || !validDate(b) || nightsBetween(a, b) < 1) throw new Error("Ngày không hợp lệ.");
    const guest = str(f, "guest_name");
    if (!guest) throw new Error("Nhập tên khách.");
    const unit = str(f, "unit_id");
    await withUser(uid, async (q) => {
      // Ưu tiên giá riêng của broker, không có thì giá mặc định
      const [rate] = await q<{ weekday_price: number; weekend_price: number; min_sell_price: number | null }>(
        `select weekday_price, weekend_price, min_sell_price from net_rates
          where unit_id=$1 and (broker_id=$2 or broker_id is null)
          order by broker_id nulls last limit 1`, [unit, uid]);
      if (!rate) throw new Error("Chủ chưa đặt giá net cho phòng này.");
      const net = priceStay(a, b, rate.weekday_price, rate.weekend_price);
      const sell = num(f, "sell_total");
      const nights = nightsBetween(a, b);
      if (rate.min_sell_price && sell < rate.min_sell_price * nights)
        throw new Error("Giá bán thấp hơn giá sàn chủ yêu cầu.");
      await q(
        `insert into bookings(unit_id,broker_id,guest_name,guest_phone,guests,check_in,check_out,net_total,sell_total,deposit_amount,note)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [unit, uid, guest, str(f, "guest_phone") || null, num(f, "guests") || null, a, b, net, sell, num(f, "deposit"), str(f, "note") || null]);
    });
  });
  redirect("/broker/bookings");
}

// ───────── Chung ─────────
export async function advanceBookingAction(f: FormData) {
  const uid = await requireUser();
  const back = str(f, "back") || "/";
  await run(back, async () => {
    const to = str(f, "to");
    await withUser(uid, (q) => q("select advance_booking($1,$2::booking_status,$3)", [str(f, "booking_id"), to, str(f, "note") || null]));
  });
  // Gửi email thông báo sau khi đã trả lời người dùng; lỗi chỉ ghi log, thông báo trong app vẫn có
  after(() => flushNotificationEmails().catch((e) => console.error("[notify]", e)));
}

export async function saveSettingsAction(f: FormData) {
  const uid = await requireUser();
  await withUser(uid, (q) => q("select set_email_notifications($1)", [f.get("email_notifications") === "on"]));
  redirect("/settings?saved=1");
}

export async function markNotificationsReadAction() {
  const uid = await requireUser();
  await withUser(uid, (q) => q("update notifications set read_at=now() where read_at is null"));
  revalidatePath("/notifications");
}
