import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { deleteImageAction, moveImageAction, uploadImageAction } from "@/lib/actions";
import { ErrorBanner } from "@/components/ErrorBanner";

export default async function PhotosPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const uid = await requireUser();
  const { id } = await params;
  const { e } = await searchParams;
  const images = await withUser(uid, async (q) => {
    const [p] = await q("select 1 from properties where id=$1 and owner_id=$2", [id, uid]);
    if (!p) return null;
    return q<{ id: string; storage_key: string }>("select id, storage_key from property_images where property_id=$1 order by sort_order, created_at", [id]);
  });
  if (!images) notFound();
  const hidden = (im: { id: string }) => (<><input type="hidden" name="property_id" value={id} /><input type="hidden" name="image_id" value={im.id} /></>);

  return (
    <div className="space-y-5">
      <ErrorBanner e={e} />
      <form action={uploadImageAction} className="card flex flex-wrap items-center gap-3">
        <input type="hidden" name="property_id" value={id} />
        <input type="file" name="images" accept="image/*" multiple required className="text-sm" />
        <button className="btn">Tải ảnh lên</button>
        <span className="text-xs text-slate-500">Chọn được nhiều ảnh; tự nén về WebP ≤1600px, mỗi ảnh tối đa 15MB.</span>
      </form>
      {images.length === 0 ? <p className="text-sm text-slate-500">Chưa có ảnh. Ảnh đầu tiên sẽ là ảnh bìa hiển thị với broker.</p> : (
        <>
          <p className="text-sm text-slate-600">Ảnh đầu tiên là ảnh bìa. Dùng nút ← → để sắp xếp thứ tự.</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((im, i) => (
              <li key={im.id} className="card p-2">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/img/${im.storage_key}`} alt="" className="aspect-[4/3] w-full rounded object-cover" />
                  {i === 0 && <span className="absolute left-1 top-1 rounded bg-teal-700 px-1.5 py-0.5 text-xs font-medium text-white">Ảnh bìa</span>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
                  <form action={moveImageAction}>{hidden(im)}<button name="dir" value="up" disabled={i === 0} className="btn-ghost !px-2 !py-1 disabled:opacity-30">←</button></form>
                  <form action={moveImageAction}>{hidden(im)}<button name="dir" value="down" disabled={i === images.length - 1} className="btn-ghost !px-2 !py-1 disabled:opacity-30">→</button></form>
                  {i > 0 && <form action={moveImageAction}>{hidden(im)}<button name="dir" value="cover" className="btn-ghost !px-2 !py-1">Đặt làm bìa</button></form>}
                  <form action={deleteImageAction} className="ml-auto">{hidden(im)}<button className="text-red-700 underline">Xoá</button></form>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
