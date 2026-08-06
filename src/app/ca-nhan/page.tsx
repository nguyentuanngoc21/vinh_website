import type { Metadata } from "next";
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
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader />
        <main>
          <ProfilePage />
        </main>
      </div>
    </div>
  );
}
