import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : undefined;

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  advanced: { database: { generateId: "uuid" } },
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  socialProviders: google,
  user: {
    // Better Auth dùng bảng `users` của dự án
    fields: { name: "fullName", image: "avatarUrl" },
    additionalFields: {
      phone: { type: "string", required: false, input: true },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30 },
  plugins: [nextCookies()], // phải đặt cuối
});
