import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicGallery } from "@/lib/albums";
import { PublicGallery } from "@/components/public-gallery";

// Link công khai: không lập chỉ mục, không gửi Referer (token nằm trong URL)
export const metadata: Metadata = { title: "Hình ảnh homestay", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function GalleryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const g = await loadPublicGallery(token);
  if (!g) notFound();
  const title = g.scope === "ALBUM" ? `${g.propertyName} · ${g.albums[0]?.name ?? ""}` : g.propertyName;
  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-4 px-3 py-6">
      <h1 className="text-center text-xl font-bold">{title}</h1>
      <PublicGallery gallery={g} />
    </main>
  );
}
