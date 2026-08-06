import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Belt-and-suspenders: proxy.ts already redirects non-admins away from
  // /admin optimistically; this re-verifies on the server before rendering
  // anything, so a stale/forged cookie can't slip through.
  await requireAdmin();

  return (
    <div className="grid flex-1 grid-cols-[230px_1fr] bg-[#F3EFE6] text-brand-ink">
      <AdminSidebar />
      <main className="overflow-hidden px-9 py-7 pb-12">{children}</main>
    </div>
  );
}
