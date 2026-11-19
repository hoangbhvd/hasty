import { requireUser } from "@/lib/session";

export default async function Page() {
  const user = await requireUser();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Chế độ CTV</h1>
      <p className="text-muted-foreground">Xin chào {user.fullName}. Tìm phòng, giữ phòng và theo dõi hoa hồng. Các mục này sẽ có ở Phase 2–4.</p>
    </div>
  );
}
