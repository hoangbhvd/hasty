import { requireUser } from "@/lib/session";
import { listDirectory } from "@/lib/directory";
import { DirectoryCard } from "@/components/directory-card";
import { Field, Select } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { AREA_LABEL, ROAD_LABEL, enumOptions } from "@/lib/labels";
import { AreaEnum } from "@/lib/validators";

type SP = { area?: string; road?: string; mode?: string; bbq?: string; ac?: string; pet?: string; karaoke?: string };

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const items = await listDirectory(user.id, {
    area: sp.area && AreaEnum.safeParse(sp.area).success ? sp.area : undefined,
    road: sp.road,
    mode: sp.mode === "whole" || sp.mode === "rooms" ? sp.mode : undefined,
    bbq: !!sp.bbq, ac: !!sp.ac, pet: !!sp.pet, karaoke: !!sp.karaoke,
  });
  const chk = (name: keyof SP, label: string) => (
    <label className="inline-flex h-11 items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={!!sp[name]} className="size-5" />{label}</label>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Khám phá Homestay</h1>
        <p className="text-sm text-muted-foreground">Homestay đang mở cộng tác. Bạn chỉ xem thông tin cơ bản; giá Net, lịch trống và kho ảnh sẽ mở sau khi chủ nhà duyệt.</p>
      </div>
      <form className="space-y-2 rounded border border-black bg-white p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Khu vực" htmlFor="d-area"><Select id="d-area" name="area" defaultValue={sp.area ?? ""} options={[{ value: "", label: "Tất cả" }, ...enumOptions(AREA_LABEL)]} /></Field>
          <Field label="Xe vào được" htmlFor="d-road"><Select id="d-road" name="road" defaultValue={sp.road ?? ""} options={[{ value: "", label: "Bất kỳ" }, ...enumOptions(ROAD_LABEL)]} /></Field>
          <Field label="Hình thức" htmlFor="d-mode"><Select id="d-mode" name="mode" defaultValue={sp.mode ?? ""} options={[{ value: "", label: "Tất cả" }, { value: "whole", label: "Nguyên căn" }, { value: "rooms", label: "Phòng lẻ" }]} /></Field>
        </div>
        <div className="flex flex-wrap gap-x-4">{chk("bbq", "BBQ")}{chk("ac", "Máy lạnh")}{chk("pet", "Thú cưng")}{chk("karaoke", "Karaoke")}</div>
        <Button type="submit" className="h-11">Lọc</Button>
      </form>
      {items.length === 0 ? (
        <p className="text-muted-foreground">Chưa có homestay nào phù hợp.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((p) => <DirectoryCard key={p.id} p={p} />)}</ul>
      )}
    </div>
  );
}
