import { Pressable, Text, View } from 'react-native';
import { Check, Field } from './Form';
import { BOOK_GENRES, MAX_SYNOPSIS, MAX_TAGS } from '../services/authoring';
import { AGE_LABEL, CONTENT_WARNINGS, minRatingFor, ratingAtLeast, type AgeRating } from './AgeGate';

export type BookInfo = {
  title: string; genre: string | null; synopsis: string; tags: string; isExclusive: boolean;
  ageRating: AgeRating; contentWarnings: string[];
};
const AGE_HINT: Record<AgeRating, string> = {
  all: 'Không có nội dung cần cảnh báo.',
  '16': 'Bạo lực, kinh dị, chủ đề nặng ở mức vừa. Người đọc tự xác nhận đủ 16 tuổi.',
  '18': 'Tình dục rõ ràng, bạo lực/máu me nặng. Chỉ tài khoản đã xác thực tuổi qua CCCD được đọc.',
};

/**
 * Title, genre, synopsis, tags and exclusivity — the fields of the web publish panel. `tags` is the
 * comma-separated text (parseTags on save). `exclusivityLocked`: published exclusive for 3+ days,
 * so it can no longer become free (the server enforces the same rule).
 */
export function BookInfoForm({ value, onChange, disabled, exclusivityLocked, ageRatingLocked }: {
  value: BookInfo; onChange: (next: BookInfo) => void; disabled?: boolean; exclusivityLocked?: boolean;
  /** Admin đã khoá nhãn độ tuổi — chỉ xem. */
  ageRatingLocked?: boolean;
}) {
  const set = (patch: Partial<BookInfo>) => onChange({ ...value, ...patch });
  const ageDisabled = !!disabled || !!ageRatingLocked;
  const floor = minRatingFor(value.contentWarnings);
  // Tick 1 cảnh báo tự nâng độ tuổi lên mức tối thiểu của nó (như web).
  const toggleWarning = (id: string) => {
    const next = value.contentWarnings.includes(id) ? value.contentWarnings.filter(w => w !== id) : [...value.contentWarnings, id];
    const nextFloor = minRatingFor(next);
    set({ contentWarnings: next, ageRating: ratingAtLeast(value.ageRating, nextFloor) ? value.ageRating : nextFloor });
  };
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
    <Text className="mb-2 mt-2 text-brand-ink">Độ tuổi</Text>
    {ageRatingLocked && <Text className="mb-3 rounded-xl bg-white p-3 leading-5 text-stone">
      🔒 Nhãn độ tuổi đã được ban kiểm duyệt khoá. Liên hệ hỗ trợ nếu bạn cần thay đổi.</Text>}
    <View className="mb-2 flex-row flex-wrap gap-2">
      {(['all', '16', '18'] as const).map(rating => {
        const selected = value.ageRating === rating;
        const blocked = ageDisabled || !ratingAtLeast(rating, floor);
        return <Pressable key={rating} accessibilityRole="radio" accessibilityState={{ selected, disabled: blocked }}
          disabled={blocked} onPress={() => set({ ageRating: rating })} style={{ opacity: blocked && !selected ? 0.45 : 1 }}
          className={`min-h-11 justify-center rounded-full border px-4 ${selected ? 'border-brand-ink bg-brand-ink' : 'border-cream-border bg-white'}`}>
          <Text className={selected ? 'font-bold text-white' : 'text-brand-ink'}>{AGE_LABEL[rating]}</Text>
        </Pressable>;
      })}
    </View>
    <Text className="mb-3 leading-5 text-stone">{AGE_HINT[value.ageRating]}</Text>
    <Text className="text-brand-ink">Cảnh báo nội dung</Text>
    <Text className="mb-1 mt-1 leading-5 text-stone">Chọn mọi nội dung có trong truyện. Một số cảnh báo yêu cầu độ tuổi tối thiểu.</Text>
    {CONTENT_WARNINGS.map(w => <Check key={w.id} checked={value.contentWarnings.includes(w.id)}
      onToggle={() => { if (!ageDisabled) toggleWarning(w.id); }}>
      <Text className="text-brand-ink">{w.label} <Text className="text-stone">({w.min}+)</Text></Text>
    </Check>)}
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
