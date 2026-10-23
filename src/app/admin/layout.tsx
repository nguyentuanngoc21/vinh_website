import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Belt-and-suspenders: proxy.ts already redirects non-admins away from
  // /admin optimistically; this re-verifies on the server before rendering
  // anything, so a stale/forged cookie can't slip through.
  await requireAdmin();

  return (
    <div className="grid flex-1 min-w-0 grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] bg-[#F3EFE6] dark:bg-surface-warm text-brand-ink">
      <AdminSidebar />
      <main className="min-w-0 px-4 py-7 pb-12 sm:px-6 xl:px-9">{children}</main>
    </div>
  );
}
