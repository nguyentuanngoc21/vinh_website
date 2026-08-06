import type { Metadata } from "next";
import { Lora } from "next/font/google";
import { Reader } from "@/components/reading/reader";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Chương 14: Đêm không trăng · Vũng Vịnh Cuối Trời — Vịnh",
};

export default function ReadPage() {
  return (
    <div className={lora.variable}>
      <Reader />
    </div>
  );
}
