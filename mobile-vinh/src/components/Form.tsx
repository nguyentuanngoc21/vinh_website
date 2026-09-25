import type { ReactNode } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string }) {
  return <View className="mb-4">
    <Text className="mb-2 text-brand-ink">{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor="#8a8178" autoCorrect={false} {...input}
      className={`rounded-xl border bg-white px-4 py-4 text-base text-brand-ink ${error ? 'border-red-700' : 'border-cream-border'}`} />
    {!!(error || hint) && <Text className={`mt-1 text-sm leading-5 ${error ? 'text-red-700' : 'text-stone'}`}>{error || hint}</Text>}
  </View>;
}

export function Button({ label, onPress, disabled, secondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={{ opacity: disabled ? 0.5 : 1 }}
    className={`mt-4 min-h-12 items-center justify-center rounded-2xl border border-brand-ink px-5 py-4 ${secondary ? 'bg-cream-card' : 'bg-brand-ink'}`}>
    <Text className={`text-center text-base font-bold ${secondary ? 'text-brand-ink' : 'text-white'}`}>{label}</Text>
  </Pressable>;
}

export function Check({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: ReactNode }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} className="mt-4 min-h-12 flex-row items-start gap-3">
    <View className={`mt-1 h-6 w-6 items-center justify-center rounded-md border border-brand-ink ${checked ? 'bg-brand-ink' : 'bg-white'}`}>
      {checked && <Text className="text-sm font-bold text-white">✓</Text>}
    </View>
    <View className="flex-1">{children}</View>
  </Pressable>;
}

export function Notice({ message, tone = 'error' }: { message: string; tone?: 'error' | 'success' }) {
  if (!message) return null;
  return <Text accessibilityLiveRegion="polite" className={`mt-5 rounded-xl bg-white p-4 leading-6 ${tone === 'error' ? 'text-red-700' : 'text-brand-ink'}`}>{message}</Text>;
}

export function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <View className="mb-6 flex-row items-center gap-3">
    <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" onPress={onBack} className="min-h-12 min-w-12 items-center justify-center rounded-xl border border-cream-border">
      <Text className="text-xl text-brand-ink">←</Text>
    </Pressable>
    <Text accessibilityRole="header" className="flex-1 text-2xl font-bold text-brand-ink">{title}</Text>
  </View>;
}
