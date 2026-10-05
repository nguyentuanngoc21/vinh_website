import type { Metadata } from "next";
import { Suspense } from "react";
import { Lora } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { ProfilePage } from "@/components/profile/profile-page";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Trang cá nhân — Vịnh",
};

export default function ProfileRoutePage() {
  return (
    <div className={`${lora.variable} flex-1 bg-surface-muted`}>
      <div className="mx-auto max-w-[1280px] bg-surface">
        <SiteHeader />
        <main>
          <Suspense fallback={null}>
            <ProfilePage />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
