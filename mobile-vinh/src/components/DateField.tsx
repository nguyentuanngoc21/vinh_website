import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { fromIsoDate, isoFromDate, dateFromIso } from '../services/profile';
import { Button } from './Form';

export type DateFieldProps = {
  label: string; value: string; onChange: (iso: string) => void;
  disabled?: boolean; optional?: boolean; hint?: string;
};
const MIN = new Date(1900, 0, 1);

/** Native calendar/spinner picker. `value` is "yyyy-mm-dd" or "" (empty); future dates are not selectable. */
export function DateField({ label, value, onChange, disabled, optional, hint }: DateFieldProps) {
  const [draft, setDraft] = useState<Date | null>(null);
  const initial = () => dateFromIso(value) ?? new Date(2000, 0, 1);
  function open() {
    if (disabled) return;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial(), mode: 'date', display: 'calendar', minimumDate: MIN, maximumDate: new Date(),
        positiveButton: { label: 'Chọn' }, negativeButton: { label: 'Hủy' },
        onValueChange: (_event, date) => onChange(isoFromDate(date)),
      });
    } else setDraft(initial());
  }
  return <View className="mb-4">
    <Text className="mb-2 text-brand-ink">{label}</Text>
    <View className="flex-row gap-3">
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? fromIsoDate(value) : 'chưa chọn'}. Chạm để chọn ngày`}
        disabled={disabled} onPress={open} style={{ opacity: disabled ? 0.5 : 1 }}
        className="min-h-12 flex-1 justify-center rounded-xl border border-cream-border bg-white px-4 py-4">
        <Text className={`text-base ${value ? 'text-brand-ink' : 'text-stone'}`}>{value ? fromIsoDate(value) : 'Chọn ngày'}</Text>
      </Pressable>
      {optional && !!value && <Pressable accessibilityRole="button" accessibilityLabel={`Xóa ${label}`} disabled={disabled}
        onPress={() => onChange('')} className="min-h-12 justify-center rounded-xl border border-cream-border px-4">
        <Text className="text-red-700">Xóa</Text>
      </Pressable>}
    </View>
    {!!hint && <Text className="mt-1 text-sm leading-5 text-stone">{hint}</Text>}
    {/* iOS: spinner in a bottom sheet so the choice is confirmed explicitly. */}
    <Modal visible={!!draft} transparent animationType="slide" onRequestClose={() => setDraft(null)}>
      <View className="flex-1 justify-end" style={{ backgroundColor: '#00000066' }}>
        <Pressable accessibilityLabel="Đóng chọn ngày" onPress={() => setDraft(null)} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom']} className="rounded-t-3xl bg-cream-card px-5 pt-4">
          <Text accessibilityRole="header" className="text-lg font-bold text-brand-ink">{label}</Text>
          {draft && <DateTimePicker value={draft} mode="date" display="spinner" locale="vi-VN" themeVariant="light"
            minimumDate={MIN} maximumDate={new Date()} onValueChange={(_event, date) => setDraft(date)} />}
          <View className="flex-row gap-3 pb-2">
            <View className="flex-1"><Button label="Hủy" secondary onPress={() => setDraft(null)} /></View>
            <View className="flex-1"><Button label="Xong" onPress={() => { if (draft) onChange(isoFromDate(draft)); setDraft(null); }} /></View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}
