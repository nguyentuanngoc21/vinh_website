import type { Role } from "@/lib/auth";

export type { Role };
export type AdminRole = Extract<Role, "admin" | "super_admin">;

/**
 * true nếu role là admin HOẶC super_admin. super_admin có mọi quyền của
 * admin CỘNG THÊM quyền đổi role — luôn dùng hàm này thay vì so `=== "admin"`
 * (bug khoá super_admin ngoài /admin đã phải sửa 2 lần, xem git log của
 * proxy.ts / session.ts).
 *
 * File riêng, không import runtime gì: an toàn cho proxy.ts (proxy runtime)
 * lẫn client component. Re-export từ lib/auth.ts.
 */
export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return role === "admin" || role === "super_admin";
}
