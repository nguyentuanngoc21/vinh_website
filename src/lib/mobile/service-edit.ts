export function serviceEdit(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Dữ liệu gói không hợp lệ.');
  const input = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if ('tags' in input) {
    if (!input.tags || typeof input.tags !== 'object' || Array.isArray(input.tags)) throw new Error('Phân loại không hợp lệ.');
    patch.tags = input.tags;
  }
  if ('monthly_commission_limit' in input) {
    const limit = input.monthly_commission_limit;
    if (limit !== null && (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 2147483647)) throw new Error('Hạn mức commission phải là số nguyên dương hoặc để trống.');
    patch.monthly_commission_limit = limit;
  }
  if ('default_usage_scope' in input) {
    if (input.default_usage_scope !== null && !['personal', 'commercial_limited', 'commercial_full'].includes(String(input.default_usage_scope))) throw new Error('Phạm vi quyền sử dụng không hợp lệ.');
    patch.default_usage_scope = input.default_usage_scope;
  }
  if ('is_private' in input) {
    if (typeof input.is_private !== 'boolean') throw new Error('Chính sách riêng tư không hợp lệ.');
    patch.is_private = input.is_private;
  }
  if ('refund_policy' in input) {
    if (input.refund_policy === null) patch.refund_policy = null;
    else {
      const policy = input.refund_policy;
      if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new Error('Chính sách hoàn tiền không hợp lệ.');
      const result: Record<string, number> = {};
      for (const stage of ['before_draft', 'draft_pending', 'draft_approved', 'delivered']) {
        const value = (policy as Record<string, unknown>)[stage];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('Nhập đủ 4 tỷ lệ hoàn tiền từ 0 đến 100%.');
        result[stage] = value;
      }
      patch.refund_policy = result;
    }
  }
  for (const key of ['name', 'scope_description', 'accepted_content', 'rejected_content']) {
    if (!(key in input)) continue;
    const value = input[key];
    if (typeof value !== 'string' || value.length > (key === 'name' ? 120 : 5000)) throw new Error('Tên hoặc mô tả quá dài/không hợp lệ.');
    patch[key] = value.trim();
  }
  for (const [key, min, max] of [['deposit_pct', 0, 100], ['delivery_days', 1, 3650], ['revisions_max', 0, 100], ['lost_contact_days', 1, 365]] as const) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value === null && key !== 'lost_contact_days') { patch[key] = null; continue; }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error('Số ngày, số lần sửa hoặc tỷ lệ cọc không hợp lệ.');
    patch[key] = value;
  }
  if ('price_tiers' in input) {
    if (!Array.isArray(input.price_tiers) || input.price_tiers.length > 20) throw new Error('Tối đa 20 mức giá.');
    patch.price_tiers = input.price_tiers.map(tier => {
      if (!tier || typeof tier.label !== 'string' || !tier.label.trim() || tier.label.length > 120 || !Number.isSafeInteger(tier.price) || tier.price <= 0) throw new Error('Mỗi mức giá cần tên và số xu nguyên dương.');
      return { label: tier.label.trim(), price: tier.price };
    });
  }
  if (!Object.keys(patch).length) throw new Error('Không có thay đổi hợp lệ.');
  return patch;
}
