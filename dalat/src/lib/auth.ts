import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { deliverAccountMessage } from "@/lib/account-notify";
import { clientIpHeader } from "@/lib/auth-ip";

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : undefined;

const baseURL = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const https = baseURL.startsWith("https://");

export const auth = betterAuth({
  baseURL,
  trustedOrigins: [baseURL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  advanced: {
    database: { generateId: "uuid" },
    useSecureCookies: https, // cookie chỉ đi qua HTTPS khi chạy production
    ipAddress: { ipAddressHeaders: [clientIpHeader] }, // IP thật do nginx đặt (không dùng X-Forwarded-For vì client giả được)
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 30 * 60, // link đặt lại mật khẩu sống 30 phút, dùng 1 lần
    revokeSessionsOnPasswordReset: true, // đổi mật khẩu xong thì đăng xuất mọi thiết bị
    // Không await: thời gian phản hồi không được phụ thuộc vào việc tài khoản có tồn tại/gửi được hay không
    sendResetPassword: async ({ user, token }) => {
      void deliverAccountMessage(
        user.id, "Đặt lại mật khẩu Đà Lạt Homestay",
        "Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu. Link có hiệu lực 30 phút và chỉ dùng được 1 lần. Nếu không phải bạn, hãy bỏ qua tin này.",
        `/reset-password?token=${encodeURIComponent(token)}`,
      );
    },
    onPasswordReset: async ({ user }) => {
      await deliverAccountMessage(user.id, "Mật khẩu đã được đổi", "Mật khẩu tài khoản của bạn vừa được thay đổi. Nếu không phải bạn, hãy đặt lại mật khẩu ngay và liên hệ quản trị viên.");
    },
  },
  // Giới hạn cho các endpoint /api/auth/* gọi trực tiếp (server action của app có bộ giới hạn riêng trong lib/account-security.ts)
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 10 },
      "/sign-up/email": { window: 60 * 60, max: 10 },
      "/request-password-reset": { window: 60 * 60, max: 10 },
      "/reset-password": { window: 60 * 60, max: 20 },
      "/change-password": { window: 15 * 60, max: 10 },
    },
  },
  socialProviders: google,
  user: {
    // Better Auth dùng bảng `users` của dự án
    fields: { name: "fullName", image: "avatarUrl" },
    additionalFields: {
      phone: { type: "string", required: false, input: true },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  plugins: [nextCookies()], // phải đặt cuối
});
