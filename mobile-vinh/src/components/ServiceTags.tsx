import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { mobileApi } from '../services/api';

type Group = { key: string; label: string; tier: string | null; rule: string | null; multi: boolean; optional: boolean;
  options: { label: string; warnText: string | null }[] };
export type ServiceTagValues = Record<string, string | string[]>;
export function ServiceTags({ userId, serviceType, value, disabled, onChange }: {
  userId: string; serviceType: string; value: ServiceTagValues; disabled: boolean; onChange: (value: ServiceTagValues) => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    mobileApi<{ groups: Group[] }>(`services/tag-options?serviceType=${encodeURIComponent(serviceType)}`, userId)
      .then(data => { if (active) setGroups(data.groups); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Không tải được phân loại.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, serviceType, attempt]);
  return <View className="mb-5">
    <Text className="mb-3 text-lg font-bold text-brand-ink">Phân loại gói</Text>
    <Text className="mb-3 leading-6 text-stone">{serviceType === 'voice' ? 'Chọn ít nhất một mục trong các nhóm thu âm.' : 'Chọn đủ các nhóm phân loại để bật nhận đơn.'}</Text>
    {loading ? <ActivityIndicator /> : error ? <View>
      <Text className="text-red-700">{error}</Text>
      <Pressable accessibilityRole="button" disabled={disabled} onPress={() => { setLoading(true); setError(''); setAttempt(n => n + 1); }} className="py-3"><Text className="text-brand-ink">Tải lại phân loại</Text></Pressable>
    </View> : !groups.length ? <Text className="text-stone">Chưa có danh mục phân loại cho dịch vụ này.</Text> : groups.map(group => {
      const current = value[group.key];
      const selected = Array.isArray(current) ? current : current ? [current] : [];
      return <View key={group.key} className="mb-4 rounded-xl border border-cream-border p-4">
        <Text className="mb-2 font-bold text-brand-ink">{group.tier ? `${group.tier} · ` : ''}{group.label}</Text>
        <Text className="mb-2 text-stone">{group.multi ? 'Chọn nhiều' : 'Chọn một'}{group.optional ? ' · Không bắt buộc' : ''}</Text>
        {!!group.rule && <Text className="mb-2 leading-6 text-stone">{group.rule}</Text>}
        {group.options.map(option => {
          const checked = selected.includes(option.label);
          return <View key={option.label}>
            <Pressable accessibilityRole={group.multi ? 'checkbox' : 'radio'} accessibilityState={{ checked, disabled }} disabled={disabled}
              onPress={() => onChange({ ...value, [group.key]: group.multi
                ? checked ? selected.filter(label => label !== option.label) : [...selected, option.label]
                : checked ? '' : option.label })} className="py-3">
              <Text className="text-brand-ink">{checked ? '●' : '○'} {option.label}</Text>
            </Pressable>
            {checked && !!option.warnText && <Text className="mb-2 leading-6 text-red-700">{option.warnText}</Text>}
          </View>;
        })}
      </View>;
    })}
    {!loading && !error && Object.entries(value).flatMap(([key, selection]) => {
      const group = groups.find(entry => entry.key === key);
      const selected = Array.isArray(selection) ? selection : selection ? [selection] : [];
      return selected.filter(label => !group?.options.some(option => option.label === label)).map(label =>
        <Pressable key={`${key}:${label}`} accessibilityRole="button" disabled={disabled} className="py-3"
          onPress={() => {
            const next = { ...value };
            if (!group) delete next[key];
            else next[key] = group.multi ? selected.filter(entry => entry !== label) : '';
            onChange(next);
          }}>
          <Text className="text-red-700">Bỏ phân loại không còn trong danh mục: {label}</Text>
        </Pressable>);
    })}
  </View>;
}
