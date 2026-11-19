import { requireUser } from "@/lib/session";

export default async function Page() {
  const user = await requireUser();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Chế độ Chủ nhà</h1>
      <p className="text-muted-foreground">Xin chào {user.fullName}. Quản lý căn, phòng, lịch và đối tác. Các mục này sẽ có ở Phase 2–4.</p>
    </div>
  );
}
