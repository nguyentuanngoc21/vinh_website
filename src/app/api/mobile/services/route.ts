import { getRequestContext, requestError } from '@/lib/mobile/request-context';
import { mobileResponse } from '@/lib/mobile/response';
import { computeCommissionStatus, computeMissingFields } from '@/lib/orders/service-listing-service';
export { OPTIONS } from '@/lib/mobile/response';
export function GET(request: Request) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getRequestContext(request); } catch (error) { return requestError(error); }
    const { client, userId } = auth;
    const { data, error } = await client.from('service_listings').select('*').eq('seller_id', userId!)
      .order('created_at', { ascending: false });
    if (error) return Response.json({ error: 'Không tải được dịch vụ.' }, { status: 502 });
    const commissions = new Map<string, { activeCommissionCount: number | null; commissionStatus: string | null }>();
    // Exact head counts avoid truncation from the database row limit. Keep
    // concurrency bounded even when a seller has many service packages.
    for (let offset = 0; offset < (data ?? []).length; offset += 5) {
      await Promise.all((data ?? []).slice(offset, offset + 5).map(async row => {
        const { count, error: countError } = await client.from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('listing_id', row.id).eq('status', 'in_progress');
        const activeCommissionCount = countError ? null : count;
        commissions.set(row.id, { activeCommissionCount,
          commissionStatus: activeCommissionCount == null ? null : computeCommissionStatus(row.is_accepting_commissions, row.monthly_commission_limit, activeCommissionCount) });
      }));
    }
    return Response.json({ listings: (data ?? []).map(row => ({ id: row.id, name: row.name,
      ...commissions.get(row.id),
      tags: row.tags,
      revisions_max: row.revisions_max, lost_contact_days: row.lost_contact_days, price_tiers: row.price_tiers,
      accepted_content: row.accepted_content, rejected_content: row.rejected_content,
      default_usage_scope: row.default_usage_scope, refund_policy: row.refund_policy, is_private: row.is_private,
      service_type: row.service_type, scope_description: row.scope_description,
      monthly_commission_limit: row.monthly_commission_limit, is_accepting_commissions: row.is_accepting_commissions,
      delivery_days: row.delivery_days, deposit_pct: row.deposit_pct,
      is_accepting_orders: row.is_accepting_orders, missingFields: computeMissingFields(row) })) });
  });
}
export function POST(request: Request) {
  return mobileResponse(request, async () => {
    let auth;
    try { auth = await getRequestContext(request); } catch (error) { return requestError(error); }
    const body = await request.json().catch(() => null);
    if (!['illustration', 'voice', 'ghostwriting'].includes(body?.serviceType)) return Response.json({ error: 'Loại dịch vụ không hợp lệ.' }, { status: 400 });
    const { data, error } = await auth.client.from('service_listings').insert({ seller_id: auth.userId!, service_type: body.serviceType })
      .select('id').single();
    if (error) return Response.json({ error: 'Chưa tạo được gói. Làm mới danh sách trước khi thử lại.' }, { status: 502 });
    return Response.json({ listing: data });
  });
}
