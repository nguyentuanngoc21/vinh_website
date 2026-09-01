import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ServiceType } from "@/lib/supabase/types";

const SERVICE_TYPES: ServiceType[] = ["illustration", "voice", "ghostwriting"];

/** GET /api/profile/services/tag-options?serviceType=illustration —
 * danh mục tag cố định do Nền tảng quản lý (Mục 2.2 đặc tả), công khai
 * đọc (không cần đăng nhập — dùng ngay ở form khai báo dịch vụ). Cấu trúc
 * "4 tầng" (tier/rule/multi/optional/warn) đối chiếu đúng
 * TAG_GROUPS/VOICE_GROUPS trong Vịnh Cá nhân.dc.html — KHÔNG phải danh
 * sách phẳng. */
export async function GET(request: Request) {
  const serviceType = new URL(request.url).searchParams.get("serviceType") as ServiceType | null;
  if (!serviceType || !SERVICE_TYPES.includes(serviceType)) {
    return NextResponse.json({ error: "serviceType không hợp lệ." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("service_tag_options")
    .select("group_key, group_label, label, tier, rule, multi, optional, warn_text")
    .eq("service_type", serviceType)
    .order("group_key")
    .order("sort_order");
  if (error) {
    console.error("[services] tag options fetch failed:", error);
    return NextResponse.json({ error: "Không tải được danh mục tag." }, { status: 500 });
  }

  type Group = {
    key: string;
    label: string;
    tier: string | null;
    rule: string | null;
    multi: boolean;
    optional: boolean;
    options: { label: string; warnText: string | null }[];
  };
  const groups = new Map<string, Group>();
  for (const row of data ?? []) {
    if (!groups.has(row.group_key)) {
      groups.set(row.group_key, {
        key: row.group_key,
        label: row.group_label,
        tier: row.tier,
        rule: row.rule,
        multi: row.multi,
        optional: row.optional,
        options: [],
      });
    }
    groups.get(row.group_key)!.options.push({ label: row.label, warnText: row.warn_text });
  }

  return NextResponse.json({ groups: Array.from(groups.values()) });
}
