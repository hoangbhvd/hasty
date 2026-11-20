"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getManagedProperty } from "@/lib/access";
import { AVAILABLE_TEMPLATES, DEFAULT_VOUCHER_CONFIG, parseVoucherConfig, type VoucherConfig } from "@/lib/voucher-config";
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

  const blocks = Object.fromEntries(
    Object.keys(DEFAULT_VOUCHER_CONFIG.blocks).map((k) => [k, fd.get(k) === "on"]),
  ) as VoucherConfig["blocks"];

  const config = parseVoucherConfig({
    template_id: s("template_id"),
    branding: {
      brand_name: s("brand_name").trim(), cover_image_url: cover, image_frame_style: s("image_frame_style"),
      primary_color: s("primary_color"), background_color: s("background_color"), font_style: s("font_style"),
    },
    blocks,
    stay_times: { checkin_time: s("checkin_time"), checkout_time: s("checkout_time") },
    custom_texts: {
      header_title: s("header_title").trim() || DEFAULT_VOUCHER_CONFIG.custom_texts.header_title,
      surcharge_policy: s("surcharge_policy"), terms_conditions: s("terms_conditions"),
      cancellation_policy: s("cancellation_policy"), footer_greeting: s("footer_greeting"),
    },
  });
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
