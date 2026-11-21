import type { Metadata } from "next";
import { lora } from "@/lib/fonts";
import { Reader } from "@/components/reading/reader";


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
