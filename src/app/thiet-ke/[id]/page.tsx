import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { DesignGallery } from "@/components/design/design-gallery";
import { getDesignGallery } from "@/lib/design/get-design-gallery";
import { createClient } from "@/lib/supabase/server";
import { getAuthedUserId } from "@/lib/wallet/session";

const getItem = cache(async (id: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const supabase = await createClient();
  const viewerId = await getAuthedUserId();
  const [item] = await getDesignGallery(supabase, viewerId, null, id);
  if (!item) notFound();

  let albumItems = [item];
  if (item.albumId) {
    const siblings = await getDesignGallery(supabase, viewerId, item.albumId);
    if (siblings.length > 0) {
      albumItems = siblings;
    }
  }

  return { item, albumItems };
});

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { item } = await getItem((await params).id);
  const title = item.albumName
    ? `${item.title} — ${item.albumName} — ${item.illustratorName} — Vịnh`
    : `${item.title} — ${item.illustratorName} — Vịnh`;
  const description = item.description || item.albumDescription || `Thiết kế của ${item.illustratorName} trên Vịnh.`;
  return {
    title,
    description,
    alternates: { canonical: `/thiet-ke/${item.id}` },
    openGraph: { title, description, images: [{ url: item.imageUrl, alt: item.title }] },
  };
}

export default async function DesignDetailPage({ params }: Props) {
  const { item, albumItems } = await getItem((await params).id);
  return (
    <div className="flex-1 bg-surface-muted">
      <div className="mx-auto max-w-[1280px] bg-surface">
        <SiteHeader searchPlaceholder="Tìm ảnh bìa…" searchType="thiet-ke" />
        <main>
          <div className="mx-4 mt-6 sm:mx-8">
            <Link
              href="/thiet-ke"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-gold-dark hover:underline"
            >
              ← Thư viện thiết kế
            </Link>
          </div>
          <DesignGallery key={item.id} items={albumItems} detailItem={item} />
        </main>
      </div>
    </div>
  );
}
