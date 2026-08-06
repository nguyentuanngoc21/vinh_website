import { Lora } from "next/font/google";
import { WorksSidebar } from "@/components/author/works-sidebar";

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export default function AuthorLayout({ children }: LayoutProps<"/author">) {
  return (
    <div
      className={`${lora.variable} grid flex-1 grid-cols-[264px_1fr] overflow-hidden bg-[#FBF8F1] text-brand-ink`}
    >
      <WorksSidebar />
      <div className="grid grid-cols-[1fr_320px] overflow-hidden">{children}</div>
    </div>
  );
}
