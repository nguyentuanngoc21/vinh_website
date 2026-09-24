import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { mobileApi } from '../services/api';
import { ServiceTags, type ServiceTagValues } from './ServiceTags';
export type EditableService = { id: string; name: string; scope_description: string; accepted_content: string | null; rejected_content: string | null;
  deposit_pct: number | null; delivery_days: number | null; revisions_max: number | null; lost_contact_days: number;
  default_usage_scope: string | null; is_private: boolean; refund_policy: Record<string, number> | null;
  monthly_commission_limit: number | null;
  service_type: string; tags: ServiceTagValues;
  price_tiers: { label: string; price: number }[] };
const textFields = { name: 'Tên gói', scope_description: 'Phạm vi công việc', accepted_content: 'Nội dung nhận', rejected_content: 'Nội dung từ chối' };
const numberFields = { deposit_pct: 'Tỷ lệ cọc (%)', delivery_days: 'Thời gian giao (ngày)', revisions_max: 'Số lần sửa', lost_contact_days: 'Thời hạn mất liên lạc (ngày)', monthly_commission_limit: 'Hạn mức commission/tháng (để trống nếu chưa đặt)' };
const scopes = { personal: 'Cá nhân', commercial_limited: 'Thương mại giới hạn', commercial_full: 'Thương mại toàn phần' };
const stages = { before_draft: 'Chưa gửi bản nháp', draft_pending: 'Có bản nháp, chưa duyệt', draft_approved: 'Đã duyệt ít nhất một bản nháp', delivered: 'Đã bàn giao, chưa xác nhận nhận hàng' };
export function ServiceEditor({ item, userId, close }: { item: EditableService; userId: string; close: (message?: string) => void }) {
  const [fields, setFields] = useState<Record<string, string>>(() => Object.fromEntries([...Object.keys(textFields), ...Object.keys(numberFields)].map(key => [key, String(item[key as keyof EditableService] ?? '')])));
  const [tiers, setTiers] = useState(() => item.price_tiers.map(t => ({ label: String(t.label ?? ''), price: String(t.price ?? '') })));
  const [busy, setBusy] = useState(false);
  const [tags, setTags] = useState(item.tags ?? {});
  const [tagsChanged, setTagsChanged] = useState(false);
  const [scope, setScope] = useState(item.default_usage_scope);
  const [privateWork, setPrivateWork] = useState(item.is_private);
  const [refund, setRefund] = useState<Record<string, string>>(() => Object.fromEntries(Object.keys(stages).map(key => [key, String(item.refund_policy?.[key] ?? '')])));
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const patch: Record<string, unknown> = { ...fields, price_tiers: tiers.map(t => ({ label: t.label, price: Number(t.price) })) };
      patch.default_usage_scope = scope;
      if (tagsChanged) patch.tags = tags;
      patch.is_private = privateWork;
      if (Object.values(refund).every(value => value.trim() === '')) patch.refund_policy = null;
      else {
        const policy: Record<string, number> = {};
        for (const key of Object.keys(stages)) {
          const raw = refund[key].trim().replace(',', '.');
          if (!/^\d+(\.\d+)?$/.test(raw) || Number(raw) > 100) throw new Error('Nhập đủ 4 tỷ lệ hoàn tiền từ 0 đến 100%.');
          policy[key] = Number(raw);
        }
        patch.refund_policy = policy;
      }
      for (const key of Object.keys(numberFields)) {
        if (fields[key] && !/^\d+$/.test(fields[key])) throw new Error('Vui lòng nhập số nguyên không âm.');
        patch[key] = fields[key] === '' ? null : Number(fields[key]);
      }
      const result = await mobileApi<{ forcedOff: boolean }>(`services/${item.id}`, userId, { action: 'edit', fields: patch });
      close(result.forcedOff ? 'Đã lưu. Gói đã tạm ngừng nhận đơn vì còn thiếu thông tin bắt buộc.' : 'Đã lưu gói dịch vụ.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được gói.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24 }}>
      <Text className="mb-5 text-2xl font-bold text-brand-ink">Chỉnh sửa gói dịch vụ</Text>
      {Object.entries({ ...textFields, ...numberFields }).map(([key, label]) => <View key={key} className="mb-4">
        <Text className="mb-2 text-brand-ink">{label}</Text>
        <TextInput accessibilityLabel={label} value={fields[key]} editable={!busy} onChangeText={value => setFields(old => ({ ...old, [key]: value }))}
          keyboardType={key in numberFields ? 'number-pad' : 'default'} multiline={key in textFields && key !== 'name'}
          maxLength={key in numberFields ? 8 : key === 'name' ? 120 : 5000} className="rounded-xl border border-cream-border bg-white p-4 text-brand-ink" />
      </View>)}
      {item.service_type !== 'ghostwriting' && <ServiceTags key={`${userId}:${item.service_type}`} userId={userId} serviceType={item.service_type} value={tags} disabled={busy}
        onChange={value => { setTags(value); setTagsChanged(true); }} />}
      <Text className="mb-3 text-lg font-bold text-brand-ink">Các mức giá (xu)</Text>
      {tiers.map((tier, index) => <View key={index} className="mb-4 rounded-xl border border-cream-border p-3">
        <TextInput accessibilityLabel={`Tên mức giá ${index + 1}`} placeholder="Tên mức giá" value={tier.label} editable={!busy} maxLength={120}
          onChangeText={label => setTiers(old => old.map((t, i) => i === index ? { ...t, label } : t))} className="mb-2 p-3 text-brand-ink" />
        <TextInput accessibilityLabel={`Giá xu ${index + 1}`} placeholder="Số xu" value={tier.price} editable={!busy} keyboardType="number-pad"
          onChangeText={price => setTiers(old => old.map((t, i) => i === index ? { ...t, price } : t))} className="p-3 text-brand-ink" />
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => setTiers(old => old.filter((_, i) => i !== index))} className="p-3"><Text className="text-red-700">Bỏ mức giá này</Text></Pressable>
      </View>)}
      <Pressable accessibilityRole="button" disabled={busy || tiers.length >= 20} onPress={() => setTiers(old => [...old, { label: '', price: '' }])} className="py-4"><Text className="text-brand-ink">+ Thêm mức giá</Text></Pressable>
      <Text className="mb-3 text-lg font-bold text-brand-ink">Quyền sử dụng mặc định</Text>
      {Object.entries(scopes).map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: scope === value }} disabled={busy}
        onPress={() => setScope(value)} className="mb-2 rounded-xl border border-cream-border p-4"><Text className="text-brand-ink">{scope === value ? '●' : '○'} {label}</Text></Pressable>)}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: privateWork }} disabled={busy} onPress={() => setPrivateWork(value => !value)} className="py-4">
        <Text className="text-brand-ink">{privateWork ? '☑' : '☐'} Sản phẩm riêng tư (private)</Text>
      </Pressable>
      <Text className="mb-3 text-lg font-bold text-brand-ink">Chính sách hoàn tiền (%)</Text>
      <Text className="mb-4 leading-6 text-stone">Tỷ lệ hoàn khi khách yêu cầu hủy. Nếu người cung cấp dịch vụ yêu cầu hủy, khách được hoàn 100% theo quy tắc hiện có. Để trống cả bốn ô nếu chưa khai chính sách.</Text>
      {Object.entries(stages).map(([key, label]) => <View key={key} className="mb-4">
        <Text className="mb-2 text-brand-ink">{label}</Text>
        <TextInput accessibilityLabel={`Tỷ lệ hoàn: ${label}`} value={refund[key]} onChangeText={value => setRefund(old => ({ ...old, [key]: value }))}
          editable={!busy} keyboardType="decimal-pad" maxLength={8} placeholder="0–100" className="rounded-xl border border-cream-border bg-white p-4 text-brand-ink" />
      </View>)}
      <Text className="mb-4 leading-6 text-stone">Quản lý mẫu ảnh/audio bằng nút Mẫu sản phẩm trong danh sách dịch vụ.</Text>
      {!!error && <Text accessibilityLiveRegion="polite" className="mb-4 text-red-700">{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void save()} className="items-center rounded-xl bg-brand-ink p-4"><Text className="text-white">{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => close()} className="items-center p-4"><Text className="text-brand-ink">Hủy chỉnh sửa</Text></Pressable>
    </ScrollView>
  </KeyboardAvoidingView>;
}
