import type { Metadata } from "next";
import { lora } from "@/lib/fonts";
import { SiteHeader } from "@/components/site-header";
import { TopupPage } from "@/components/topup/topup-page";


export const metadata: Metadata = {
  title: "Nạp token — Vịnh",
};

export default function TopupRoutePage() {
  return (
    <div className={`${lora.variable} flex-1 bg-surface-muted`}>
      <div className="mx-auto max-w-[1280px] bg-surface">
        <SiteHeader />
        <main>
          <TopupPage />
        </main>
      </div>
    </div>
  );
}
