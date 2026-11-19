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
import { endSession, loginUser, registerUser, requestPasswordReset, sendEmailVerification, verifyEmail, requireUser, resetPassword, startSession } from "./auth";
import { nightsBetween, priceStayWithSeasons, validDate } from "./format";
import { AMENITIES } from "./property";
import { importHtml, STARTER_CSS, STARTER_HTML } from "./confirmation";

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
  // Chưa đăng nhập: phải bấm liên kết trong email trước
  try { await sendEmailVerification(d.data.email); }
  catch (e) { console.error("[verify-mail]", e); redirect("/verify?e=" + encodeURIComponent("Đã tạo tài khoản nhưng chưa gửi được email xác minh. Nhập email để gửi lại.")); }
  redirect("/verify?sent=1");
}

export async function loginAction(f: FormData) {
  const u = await loginUser(str(f, "email"), String(f.get("password") ?? ""));
  if (!u) redirect("/login?e=" + encodeURIComponent("Sai email hoặc mật khẩu."));
  if (!u.verified) redirect("/verify?e=" + encodeURIComponent("Email chưa được xác minh. Hãy bấm liên kết trong email, hoặc nhập email để gửi lại."));
  await startSession(u.id);
  redirect("/");
}

export async function resendVerificationAction(f: FormData) {
  const email = z.string().email().safeParse(str(f, "email"));
  if (!email.success) redirect("/verify?e=" + encodeURIComponent("Nhập email hợp lệ."));
  try { await sendEmailVerification(email.data); } catch (e) { console.error("[verify-mail]", e); }
  redirect("/verify?sent=1");
}

export async function verifyEmailAction(f: FormData) {
  if (!(await verifyEmail(str(f, "token")))) redirect("/verify?e=" + encodeURIComponent("Liên kết không hợp lệ hoặc đã hết hạn. Nhập email để nhận liên kết mới."));
  redirect("/login?ok=" + encodeURIComponent("Đã xác minh email. Hãy đăng nhập."));
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

export async function updatePropertyAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}/info`, async () => {
    const name = str(f, "name");
    if (!name) throw new Error("Nhập tên cơ sở.");
    const time = (k: string, d: string) => (/^\d{2}:\d{2}$/.test(str(f, k)) ? str(f, k) : d);
    const known = new Set(AMENITIES.map((x) => x.key));
    const amenities = f.getAll("amenities").map(String).filter((k) => known.has(k));
    await withUser(uid, (q) => q(
      `update properties set name=$2, type=$3, address=$4, area=$5, description=$6, amenities=$7,
              checkin_time=$8, checkout_time=$9, cancel_policy=$10, house_rules=$11
       where id=$1`,
      [pid, name, str(f, "type") === "hotel" ? "hotel" : "homestay", str(f, "address") || null, str(f, "area") || null,
       str(f, "description") || null, amenities, time("checkin_time", "14:00"), time("checkout_time", "12:00"),
       str(f, "cancel_policy") || null, str(f, "house_rules") || null]));
  });
  redirect(`/owner/${pid}/info?saved=1`);
}

export async function addUnitAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}/rooms`, async () => {
    const name = str(f, "name");
    if (!name) throw new Error("Nhập tên phòng.");
    await withUser(uid, (q) => q("insert into units(property_id,name,capacity,description,min_nights) values ($1,$2,$3,$4,$5)",
      [pid, name, num(f, "capacity") || 2, str(f, "description") || null, Math.min(60, num(f, "min_nights") || 1)]));
  });
}

export async function updateUnitAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}/rooms`, async () => {
    const name = str(f, "name");
    if (!name) throw new Error("Nhập tên phòng.");
    await withUser(uid, (q) => q(
      "update units set name=$2, capacity=$3, description=$4, min_nights=$5, active=$6 where id=$1",
      [str(f, "unit_id"), name, num(f, "capacity") || 2, str(f, "description") || null, Math.min(60, num(f, "min_nights") || 1), f.get("active") === "on"]));
  });
}

export async function deleteUnitAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}/rooms`, async () => {
    try {
      await withUser(uid, (q) => q("delete from units where id=$1", [str(f, "unit_id")]));
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((e as any)?.code === "23503") throw new Error("Phòng đã có booking nên không xoá được. Hãy tắt “Đang bán” để ẩn phòng.");
      throw e;
    }
  });
}

export async function saveSeasonAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}/pricing`, async () => {
    const a = str(f, "start_date"), b = str(f, "end_date");
    if (!validDate(a) || !validDate(b) || b < a) throw new Error("Khoảng ngày không hợp lệ.");
    const wd = num(f, "weekday"), we = num(f, "weekend");
    if (!wd) throw new Error("Nhập giá net ngày thường.");
    // "all" = áp dụng cho mọi phòng của cơ sở
    const target = str(f, "unit_id");
    await withUser(uid, async (q) => {
      const units = target === "all"
        ? await q<{ id: string }>("select id from units where property_id=$1", [pid])
        : [{ id: target }];
      for (const u of units) await q(
        "insert into rate_seasons(unit_id,name,start_date,end_date,weekday_price,weekend_price) values ($1,$2,$3,$4,$5,$6)",
        [u.id, str(f, "name").slice(0, 80), a, b, wd, we || wd]);
    });
  });
}

export async function deleteSeasonAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}/pricing`, () => withUser(uid, (q) => q("delete from rate_seasons where id=$1", [str(f, "season_id")])).then(() => undefined));
}

export async function saveRateAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}/pricing`, async () => {
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
  await run(`/owner/${pid}/brokers`, async () => {
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
  await run(`/owner/${pid}/photos`, async () => {
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
  await run(`/owner/${pid}/photos`, async () => {
    const rows = await withUser(uid, (q) => q<{ storage_key: string }>(
      "delete from property_images where id=$1 returning storage_key", [str(f, "image_id")]));
    for (const r of rows) await fs.rm(path.join(UPLOAD_DIR, r.storage_key), { force: true });
  });
}

/** Đổi thứ tự ảnh: dir = up|down, hoặc cover = đưa lên đầu (ảnh bìa). */
export async function moveImageAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/owner/${pid}/photos`, async () => {
    const id = str(f, "image_id"), dir = str(f, "dir");
    await withUser(uid, async (q) => {
      const rows = await q<{ id: string }>("select id from property_images where property_id=$1 order by sort_order, created_at", [pid]);
      const ids = rows.map((r) => r.id);
      const i = ids.indexOf(id);
      if (i < 0) return;
      ids.splice(i, 1);
      const to = dir === "cover" ? 0 : dir === "up" ? Math.max(0, i - 1) : Math.min(ids.length, i + 1);
      ids.splice(to, 0, id);
      for (let k = 0; k < ids.length; k++) await q("update property_images set sort_order=$2 where id=$1", [ids[k], k]);
    });
  });
}

// ───────── Broker ─────────
export async function requestLinkAction(f: FormData) {
  const uid = await requireUser();
  await run("/broker/properties", async () => {
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
      const [unitRow] = await q<{ min_nights: number }>("select min_nights from units where id=$1", [unit]);
      const [rate] = await q<{ weekday_price: number; weekend_price: number; min_sell_price: number | null }>(
        `select weekday_price, weekend_price, min_sell_price from net_rates
          where unit_id=$1 and (broker_id=$2 or broker_id is null)
          order by broker_id nulls last limit 1`, [unit, uid]);
      if (!rate) throw new Error("Chủ chưa đặt giá net cho phòng này.");
      const seasons = await q<{ start_date: string; end_date: string; weekday_price: number; weekend_price: number }>(
        "select start_date, end_date, weekday_price, weekend_price from rate_seasons where unit_id=$1 order by created_at", [unit]);
      const nights = nightsBetween(a, b);
      if (unitRow && nights < unitRow.min_nights) throw new Error(`Phòng này yêu cầu tối thiểu ${unitRow.min_nights} đêm.`);
      const net = priceStayWithSeasons(a, b, rate, seasons);
      const sell = num(f, "sell_total");
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

// ───────── Chủ tạo booking trực tiếp ─────────
export async function createDirectBookingAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  const a = str(f, "check_in"), b = str(f, "check_out");
  let id = "";
  await run(`/owner/${pid}`, async () => {
    if (!validDate(a) || !validDate(b) || nightsBetween(a, b) < 1) throw new Error("Ngày không hợp lệ.");
    const guest = str(f, "guest_name");
    if (!guest) throw new Error("Nhập tên khách.");
    const price = num(f, "price"), deposit = num(f, "deposit");
    if (deposit > price) throw new Error("Tiền cọc lớn hơn tổng tiền.");
    // Chủ tự quyết: vào thẳng "Đã chốt" và giữ phòng; trùng lịch bị exclusion constraint chặn.
    id = await withUser(uid, async (q) => (await q<{ id: string }>(
      `insert into bookings(unit_id,broker_id,guest_name,guest_phone,guests,check_in,check_out,net_total,sell_total,deposit_amount,status,note)
       values ($1,null,$2,$3,$4,$5,$6,$7,$7,$8,'confirmed',$9) returning id`,
      [str(f, "unit_id"), guest, str(f, "guest_phone") || null, num(f, "guests") || null, a, b, price, deposit, str(f, "note") || null]))[0].id);
  });
  redirect(`/confirmation/${id}`);
}

// ───────── Mẫu xác nhận booking ─────────
export async function createTemplateAction(f: FormData) {
  const uid = await requireUser();
  let id = "";
  await run("/templates", async () => {
    const name = str(f, "name");
    if (!name) throw new Error("Nhập tên mẫu.");
    id = await withUser(uid, async (q) => (await q<{ id: string }>(
      "insert into booking_templates(owner_id,name,html,css) values ($1,$2,$3,$4) returning id",
      [uid, name.slice(0, 120), STARTER_HTML, STARTER_CSS]))[0].id);
  });
  redirect(`/templates/${id}`);
}

export async function importTemplateAction(f: FormData) {
  const uid = await requireUser();
  let id = "";
  await run("/templates", async () => {
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Chọn một file .html.");
    if (file.size > 2.5 * 1024 * 1024) throw new Error("File quá lớn (tối đa 2,5MB). Hãy dùng ảnh nhỏ hơn hoặc nhúng ảnh nén.");
    const { html, css } = importHtml(await file.text());
    if (!html) throw new Error("Không đọc được nội dung trang trong file.");
    const name = str(f, "name") || file.name.replace(/\.html?$/i, "");
    id = await withUser(uid, async (q) => (await q<{ id: string }>(
      "insert into booking_templates(owner_id,name,html,css) values ($1,$2,$3,$4) returning id",
      [uid, name.slice(0, 120), html, css]))[0].id);
  });
  redirect(`/templates/${id}`);
}

/** Gọi trực tiếp từ trình soạn thảo (client). Trả về lỗi dạng chuỗi thay vì redirect. */
export async function saveTemplateAction(id: string, name: string, html: string, css: string, project: unknown): Promise<{ ok: boolean; error?: string }> {
  const uid = await requireUser();
  try {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Mẫu không hợp lệ.");
    if (!name.trim()) throw new Error("Nhập tên mẫu.");
    const rows = await withUser(uid, (q) => q(
      "update booking_templates set name=$2, html=$3, css=$4, project=$5, updated_at=now() where id=$1 returning id",
      [id, name.trim().slice(0, 120), html, css, JSON.stringify(project ?? null)]));
    if (!rows.length) throw new Error("Không tìm thấy mẫu.");
    revalidatePath("/templates");
    return { ok: true };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return { ok: false, error: code === "23514" ? "Mẫu quá lớn (tối đa ~3MB, hãy dùng ảnh nhỏ hơn)." : friendly(e) };
  }
}

export async function deleteTemplateAction(f: FormData) {
  const uid = await requireUser();
  await run("/templates", async () => {
    await withUser(uid, (q) => q("delete from booking_templates where id=$1", [str(f, "id")]));
  });
}

// ───────── Broker: cơ sở tự quản lý ─────────
const lines = (f: FormData, k: string) =>
  [...new Set(String(f.get(k) ?? "").split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean))].slice(0, 100);

export async function createMyPropertyAction(f: FormData) {
  const uid = await requireUser();
  let id = "";
  await run("/broker/mine", async () => {
    const name = str(f, "name");
    if (!name) throw new Error("Nhập tên cơ sở.");
    id = await withUser(uid, async (q) => (await q<{ id: string }>(
      "insert into broker_properties(broker_id,name,address,rooms) values ($1,$2,$3,$4) returning id",
      [uid, name, str(f, "address") || null, lines(f, "rooms")]))[0].id);
  });
  redirect(`/broker/mine/${id}`);
}

export async function updateMyPropertyAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/broker/mine/${pid}`, async () => {
    const name = str(f, "name");
    if (!name) throw new Error("Nhập tên cơ sở.");
    await withUser(uid, (q) => q("update broker_properties set name=$2, address=$3, rooms=$4 where id=$1",
      [pid, name, str(f, "address") || null, lines(f, "rooms")]));
  });
}

export async function deleteMyPropertyAction(f: FormData) {
  const uid = await requireUser();
  await run(`/broker/mine/${str(f, "property_id")}`, async () => {
    await withUser(uid, (q) => q("delete from broker_properties where id=$1", [str(f, "property_id")]));
  });
  redirect("/broker/mine");
}

export async function saveMyBookingAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  const id = str(f, "id");
  await run(`/broker/mine/${pid}`, async () => {
    const ci = str(f, "check_in"), co = str(f, "check_out");
    if (!/^\d{4}-\d\d-\d\d$/.test(ci) || !/^\d{4}-\d\d-\d\d$/.test(co)) throw new Error("Chọn ngày check-in và check-out.");
    if (co <= ci) throw new Error("Ngày check-out phải sau ngày check-in.");
    const guest = str(f, "guest_name");
    if (!guest) throw new Error("Nhập tên khách.");
    const nights = nightsBetween(ci, co);
    const nightly = num(f, "nightly_price");
    const total = num(f, "total") || nightly * nights;   // để trống tổng tiền = giá/đêm × số đêm
    const deposit = num(f, "deposit");
    const net = num(f, "net_total");
    if (net > total) throw new Error("Giá vốn lớn hơn tổng tiền (lãi âm). Kiểm tra lại.");
    if (deposit > total) throw new Error("Tiền cọc lớn hơn tổng tiền.");
    const args = [pid, str(f, "rooms") || null, ci, co, guest, str(f, "guest_phone") || null, nightly, total, deposit, str(f, "note") || null, net];
    await withUser(uid, async (q) => {
      if (id) {
        await q(`update broker_bookings set rooms=$2, check_in=$3, check_out=$4, guest_name=$5, guest_phone=$6,
                   nightly_price=$7, total=$8, deposit=$9, note=$10, net_total=$11 where id=$1 and property_id=$12`, [id, ...args.slice(1), pid]);
      } else {
        await q(`insert into broker_bookings(broker_id,property_id,rooms,check_in,check_out,guest_name,guest_phone,nightly_price,total,deposit,note,net_total)
                 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [uid, ...args]);
      }
    });
  });
}

export async function setMyBookingStatusAction(f: FormData) {
  const uid = await requireUser();
  const pid = str(f, "property_id");
  await run(`/broker/mine/${pid}`, async () => {
    const st = str(f, "status");
    if (st === "delete") await withUser(uid, (q) => q("delete from broker_bookings where id=$1", [str(f, "id")]));
    else await withUser(uid, (q) => q("update broker_bookings set status=$2 where id=$1", [str(f, "id"), st === "cancelled" ? "cancelled" : "active"]));
  });
}
