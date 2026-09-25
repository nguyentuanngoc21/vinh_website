import { Pressable, Text, View } from 'react-native';
import { Check, Field } from './Form';
import { BOOK_GENRES, MAX_SYNOPSIS, MAX_TAGS } from '../services/authoring';

export type BookInfo = { title: string; genre: string | null; synopsis: string; tags: string; isExclusive: boolean };

/**
 * Title, genre, synopsis, tags and exclusivity — the fields of the web publish panel. `tags` is the
 * comma-separated text (parseTags on save). `exclusivityLocked`: published exclusive for 3+ days,
 * so it can no longer become free (the server enforces the same rule).
 */
export function BookInfoForm({ value, onChange, disabled, exclusivityLocked }: {
  value: BookInfo; onChange: (next: BookInfo) => void; disabled?: boolean; exclusivityLocked?: boolean;
}) {
  const set = (patch: Partial<BookInfo>) => onChange({ ...value, ...patch });
  return <View>
    <Field label="Tên truyện" value={value.title} onChangeText={title => set({ title })} editable={!disabled} maxLength={200} autoCorrect />
    <Text className="mb-2 text-brand-ink">Thể loại</Text>
    <View className="mb-4 flex-row flex-wrap gap-2">
      {BOOK_GENRES.map(genre => <Pressable key={genre} accessibilityRole="radio" accessibilityState={{ selected: value.genre === genre, disabled: !!disabled }}
        disabled={disabled} onPress={() => set({ genre })}
        className={`min-h-11 justify-center rounded-full border px-4 ${value.genre === genre ? 'border-brand-ink bg-brand-ink' : 'border-cream-border bg-white'}`}>
        <Text className={value.genre === genre ? 'font-bold text-white' : 'text-brand-ink'}>{genre}</Text>
      </Pressable>)}
    </View>
    <Field label="Tóm tắt" value={value.synopsis} onChangeText={synopsis => set({ synopsis })} editable={!disabled} multiline autoCorrect
      maxLength={MAX_SYNOPSIS} hint={`${value.synopsis.length}/${MAX_SYNOPSIS} ký tự`} style={{ minHeight: 110, textAlignVertical: 'top' }} />
    <Field label="Thẻ (cách nhau bằng dấu phẩy)" value={value.tags} onChangeText={tags => set({ tags })} editable={!disabled}
      placeholder="vd: báo thù, cung đấu" hint={`Tối đa ${MAX_TAGS} thẻ.`} />
    <Check checked={value.isExclusive} onToggle={() => {
      if (disabled || (exclusivityLocked && value.isExclusive)) return;
      set({ isExclusive: !value.isExclusive });
    }}>
      <Text className="font-bold text-brand-ink">Độc quyền trên Vịnh</Text>
      <Text className="mt-1 leading-5 text-stone">
        {exclusivityLocked && value.isExclusive
          ? 'Tác phẩm đã xuất bản độc quyền quá 3 ngày nên không thể chuyển về tự do.'
          : 'Cần xác nhận Chính sách độc quyền xuất bản. Sau 3 ngày kể từ lúc xuất bản sẽ không chuyển về tự do được nữa.'}
      </Text>
    </Check>
  </View>;
}
