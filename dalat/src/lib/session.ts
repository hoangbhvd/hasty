import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Lấy user hiện tại (đã verify session trong DB), cache theo request. */
export const getCurrentUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      avatarUrl: true,
      isHost: true,
      isBroker: true,
    },
  });
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
