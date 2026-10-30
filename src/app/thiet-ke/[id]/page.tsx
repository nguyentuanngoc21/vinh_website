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
  return item;
});

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await getItem((await params).id);
  const title = `${item.title} — ${item.illustratorName} — Vịnh`;
  const description = item.description || `Thiết kế của ${item.illustratorName} trên Vịnh.`;
  return {
    title,
    description,
    alternates: { canonical: `/thiet-ke/${item.id}` },
    openGraph: { title, description, images: [{ url: item.imageUrl, alt: item.title }] },
  };
}

export default async function DesignDetailPage({ params }: Props) {
  const item = await getItem((await params).id);
  return (
    <div className="flex-1 bg-surface-muted">
      <div className="mx-auto max-w-[1280px] bg-surface">
        <SiteHeader searchPlaceholder="Tìm ảnh bìa…" searchType="thiet-ke" />
        <main>
          <Link href="/thiet-ke" className="mx-4 mt-6 inline-block text-sm font-semibold text-brand-gold-dark sm:mx-8">
            ← Thư viện thiết kế
          </Link>
          <DesignGallery key={item.id} items={[item]} detailItem={item} />
        </main>
      </div>
    </div>
  );
}
