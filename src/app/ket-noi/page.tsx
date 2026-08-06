import type { Metadata } from "next";
import { Suspense } from "react";
import { Lora } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { ConnectDirectory } from "@/components/connect/connect-directory";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: "Kết nối — Vịnh",
};

export default function ConnectPage() {
  return (
    <div className={`${lora.variable} flex-1 bg-[#f2f2f3]`}>
      <div className="mx-auto max-w-[1280px] bg-white">
        <SiteHeader showSearch={false} />
        <main>
          <Suspense fallback={null}>
            <ConnectDirectory />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
