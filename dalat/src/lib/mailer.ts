import nodemailer from "nodemailer";

export const INTERNAL_EMAIL_DOMAIN = "@phone.hmstay.local";
/** Email thật (không phải email nội bộ tự sinh cho tài khoản chỉ đăng ký bằng SĐT). */
export const isRealEmail = (email: string | null | undefined): email is string => !!email && !email.toLowerCase().endsWith(INTERNAL_EMAIL_DOMAIN);

export const mailerEnabled = () => !!(process.env.SMTP_HOST && process.env.SMTP_FROM);

type Transport = { sendMail(opts: { from: string; to: string; subject: string; text: string }): Promise<unknown> };
let cached: Transport | undefined;
const transport = (): Transport =>
  (cached ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
  }));

/** Gửi email; không bao giờ ném lỗi (trả về false). `t` để test. */
export async function sendMail(to: string, subject: string, text: string, t?: Transport): Promise<boolean> {
  if (!t && !mailerEnabled()) return false;
  try {
    await (t ?? transport()).sendMail({ from: process.env.SMTP_FROM ?? "no-reply@localhost", to, subject, text });
    return true;
  } catch (e) {
    console.error("[mail] gửi lỗi:", (e as Error).message);
    return false;
  }
}
