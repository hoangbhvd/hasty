"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/modal";
import { Field, Select } from "@/components/form-fields";
import { ACCESS_ROLE_HINT, ACCESS_ROLE_LABEL, enumOptions } from "@/lib/labels";
import { setLinkAccessAction } from "@/app/(app)/host/partners/actions";

type Role = keyof typeof ACCESS_ROLE_LABEL;

function AccessForm({ linkId, role: r0, instant: i0, assigned: a0, properties, onDone }: { linkId: string; role: Role; instant: boolean; assigned: string[] | null; properties: { id: string; name: string }[]; onDone: () => void }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(r0);
  const [instant, setInstant] = useState(i0);
  const [all, setAll] = useState(a0 === null);
  const [ids, setIds] = useState<string[]>(a0 ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(undefined);
      const res = await setLinkAccessAction(linkId, { accessRole: role, allowInstantBook: instant, assignedPropertyIds: role === "BROKER" || all ? null : ids });
      setBusy(false);
      if (res.error) return setError(res.error);
      router.refresh(); onDone();
    }}>
      <Field label="Vai trò" htmlFor="pa-role" hint={ACCESS_ROLE_HINT[role]}>
        <Select id="pa-role" value={role} onChange={(e) => setRole(e.target.value as Role)} options={enumOptions(ACCESS_ROLE_LABEL)} />
      </Field>
      {role === "BROKER" && (
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-foreground" checked={instant} onChange={(e) => setInstant(e.target.checked)} />Cho phép đặt ngay (chốt đơn không cần giữ phòng 30 phút)</label>
      )}
      {role !== "BROKER" && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Áp dụng cho</legend>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-foreground" checked={all} onChange={(e) => setAll(e.target.checked)} />Tất cả căn của tôi</label>
          {!all && properties.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-2 rounded border border-black bg-white px-3 text-sm">
              <input type="checkbox" className="size-5 accent-foreground" checked={ids.includes(p.id)} onChange={(e) => setIds((c) => (e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id)))} />{p.name}
            </label>
          ))}
          {!all && ids.length === 0 && <p className="text-xs text-red-700">Chọn ít nhất 1 căn, hoặc bật “Tất cả căn”.</p>}
        </fieldset>
      )}
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      <Button type="submit" size="lg" className="h-12 w-full" disabled={busy || (role !== "BROKER" && !all && ids.length === 0)}>{busy ? "Đang lưu…" : "Lưu phân quyền"}</Button>
    </form>
  );
}

/** Dòng tóm tắt + nút mở hộp thoại phân quyền Co-host / Quản gia cho 1 đối tác đã duyệt. */
export function PartnerAccess(props: { linkId: string; name: string; role: Role; instant: boolean; assigned: string[] | null; properties: { id: string; name: string }[] }) {
  const scope = props.role === "BROKER" ? "" : props.assigned === null ? " · mọi căn" : ` · ${props.assigned.length} căn`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded border border-black bg-white px-2 py-1 text-xs font-semibold">{ACCESS_ROLE_LABEL[props.role]}{scope}{props.role === "BROKER" && props.instant ? " · đặt ngay" : ""}</span>
      <Modal trigger="Phân quyền" title={`Phân quyền: ${props.name}`}>{(close) => <AccessForm {...props} onDone={close} />}</Modal>
    </div>
  );
}
