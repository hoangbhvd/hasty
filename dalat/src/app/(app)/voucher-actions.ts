"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getManagedProperty } from "@/lib/access";
import { AVAILABLE_TEMPLATES, parsePdfme, parseVoucherConfig, type VoucherConfig } from "@/lib/voucher-config";
import { configFromForm } from "@/lib/voucher-form";
import { bcTemplateKey, keyFromUrl, keyPrefix, publicUrlFor, r2Configured } from "@/lib/r2";
import { regenerateVoucherToken, setVoucherExpiry, VoucherLinkError } from "@/lib/voucher-link";
import type { FormState } from "@/app/(auth)/actions";

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function saveVoucherConfigAction(propertyId: string, _: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const property = await getManagedProperty(user.id, propertyId);
  if (!property) return { error: "Không có quyền" };

  const s = (k: string) => String(fd.get(k) ?? "");
  for (const k of ["primary_color", "background_color"]) if (!HEX.test(s(k))) return { error: "Màu phải có dạng #RRGGBB" };
  if (!(AVAILABLE_TEMPLATES as readonly string[]).includes(s("template_id"))) return { error: "Mẫu này chưa khả dụng" };

  // Ảnh bìa chỉ được chọn trong số ảnh của chính căn này (không nhận URL tuỳ ý)
  let cover: string | null = null;
  const wanted = s("cover_image_url");
  if (wanted) {
    const m = await prisma.propertyMedia.findFirst({ where: { propertyId, url: wanted, mediaType: "IMAGE" }, select: { url: true } });
    if (!m) return { error: "Ảnh bìa không thuộc căn này" };
    cover = m.url;
  }

  // Logo chỉ nhận file đã tải lên R2 cho chính căn này
  let logo: string | null = null;
  const wantedLogo = s("logo_url");
  if (wantedLogo) {
    const key = keyFromUrl(wantedLogo.split("?")[0]);
    if (!key || !key.startsWith(`${keyPrefix(propertyId)}logo.`)) return { error: "Logo không hợp lệ" };
    logo = wantedLogo;
  }
  const prev = parseVoucherConfig(property.voucherConfig);
  // mode + pdfme_config do tab "Canva + kéo thả" quản lý, form này không đụng tới
  const config = configFromForm(fd, { cover, logo, mode: prev.mode, pdfme: prev.pdfme_config });
  await prisma.property.update({ where: { id: propertyId }, data: { voucherConfig: config } });
  revalidatePath(`/host/properties/${propertyId}`);
  revalidatePath(`/broker/properties/${propertyId}`);
  return {};
}

async function linkRun(f: () => Promise<unknown>, bookingId: string): Promise<FormState> {
  try {
    await f();
  } catch (e) {
    if (e instanceof VoucherLinkError) return { error: e.message };
    console.error(e);
    return { error: "Không thực hiện được, thử lại" };
  }
  revalidatePath(`/host/bookings/${bookingId}`);
  revalidatePath(`/broker/bookings/${bookingId}`);
  return {};
}

export async function regenerateVoucherLinkAction(bookingId: string): Promise<FormState> {
  const user = await requireUser();
  return linkRun(() => regenerateVoucherToken(user.id, bookingId), bookingId);
}

/** days: 0 = bỏ hạn */
export async function setVoucherExpiryAction(bookingId: string, days: number): Promise<FormState> {
  const user = await requireUser();
  return linkRun(() => setVoucherExpiry(user.id, bookingId, days === 0 ? null : days), bookingId);
}

async function ownedConfig(propertyId: string) {
  const user = await requireUser();
  const property = await getManagedProperty(user.id, propertyId);
  if (!property) return null;
  return { property, config: parseVoucherConfig(property.voucherConfig) };
}

async function savePdfme(propertyId: string, patch: (c: VoucherConfig) => VoucherConfig) {
  const cur = await ownedConfig(propertyId);
  if (!cur) return { error: "Không có quyền" };
  await prisma.property.update({ where: { id: propertyId }, data: { voucherConfig: patch(cur.config) } });
  revalidatePath(`/host/properties/${propertyId}`);
  revalidatePath(`/broker/properties/${propertyId}`);
  return {};
}

/** Ghi nhận PDF nền đã tải lên R2 (khoá cố định, ?v= để làm mới cache). */
export async function registerPdfmeBaseAction(propertyId: string): Promise<{ error?: string }> {
  if (!r2Configured()) return { error: "Chưa cấu hình Cloudflare R2" };
  return savePdfme(propertyId, (c) => ({ ...c, pdfme_config: { ...c.pdfme_config, base_pdf_url: `${publicUrlFor(bcTemplateKey(propertyId))}?v=${Date.now()}` } }));
}

/** Lưu vị trí các ô biến động. `schemas` đi qua parsePdfme: chỉ giữ biến cho phép, kẹp toạ độ. */
export async function savePdfmeSchemasAction(propertyId: string, schemas: unknown): Promise<{ error?: string }> {
  return savePdfme(propertyId, (c) => ({ ...c, pdfme_config: parsePdfme({ base_pdf_url: c.pdfme_config.base_pdf_url, schemas }) }));
}

export async function setVoucherModeAction(propertyId: string, mode: string): Promise<{ error?: string }> {
  const cur = await ownedConfig(propertyId);
  if (!cur) return { error: "Không có quyền" };
  if (mode !== "TEMPLATE" && mode !== "CUSTOM_PDFME") return { error: "Chế độ không hợp lệ" };
  if (mode === "CUSTOM_PDFME" && (!cur.config.pdfme_config.base_pdf_url || cur.config.pdfme_config.schemas.length === 0)) {
    return { error: "Hãy tải PDF nền và đặt ít nhất 1 ô biến động rồi lưu mẫu trước" };
  }
  return savePdfme(propertyId, (c) => ({ ...c, mode }));
}
