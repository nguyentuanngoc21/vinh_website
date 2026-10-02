import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { secureStorage } from '../services/storage';

// Nhãn + cảnh báo — khớp src/lib/age-rating.ts ở web (danh sách + độ tuổi tối thiểu phải giống nhau;
// server tự nâng độ tuổi theo cảnh báo và DB có CHECK chặn tổ hợp sai).
export type AgeRating = 'all' | '16' | '18';
export const AGE_LABEL = { all: 'Mọi lứa tuổi', '16': '16+', '18': '18+' } as const;
export const CONTENT_WARNINGS: { id: string; label: string; min: '16' | '18' }[] = [
  { id: 'violence', label: 'Bạo lực', min: '16' }, { id: 'gore', label: 'Máu me', min: '16' },
  { id: 'gore_extreme', label: 'Máu me / tra tấn nặng', min: '18' }, { id: 'sexual_mild', label: 'Nội dung tình dục nhẹ', min: '16' },
  { id: 'sexual_explicit', label: 'Tình dục rõ ràng', min: '18' }, { id: 'self_harm', label: 'Tự hại / tự sát', min: '16' },
  { id: 'abuse', label: 'Xâm hại / lạm dụng', min: '18' }, { id: 'domestic_violence', label: 'Bạo hành gia đình', min: '16' },
  { id: 'horror', label: 'Kinh dị / ám ảnh tâm lý', min: '16' }, { id: 'substances', label: 'Chất kích thích', min: '16' },
  { id: 'profanity', label: 'Ngôn từ thô tục', min: '16' },
];
const WARNING_LABEL: Record<string, string> = Object.fromEntries(CONTENT_WARNINGS.map(w => [w.id, w.label]));
const RANK: Record<AgeRating, number> = { all: 0, '16': 1, '18': 2 };
/** Độ tuổi thấp nhất được phép với bộ cảnh báo này. */
export function minRatingFor(warnings: string[]): AgeRating {
  return warnings.reduce<AgeRating>((min, id) => {
    const w = CONTENT_WARNINGS.find(x => x.id === id);
    return w && RANK[w.min] > RANK[min] ? w.min : min;
  }, 'all');
}
export const ratingAtLeast = (rating: AgeRating, floor: AgeRating) => RANK[rating] >= RANK[floor];
const RED = '#b02a37';
const GOLD = '#d9a441';

export function AgeBadge({ rating }: { rating: 'all' | '16' | '18' }) {
  if (rating === 'all') return null;
  return <View accessibilityLabel={`Truyện ${AGE_LABEL[rating]}`} style={{ alignSelf: 'flex-start', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 3, backgroundColor: rating === '18' ? RED : GOLD }}>
    <Text style={{ color: rating === '18' ? '#fff' : '#143b4d', fontSize: 12, fontWeight: '700' }}>{AGE_LABEL[rating]}</Text>
  </View>;
}

export function ContentWarnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return <Text className="mb-4 text-sm leading-6 text-stone">
    ⚠ Cảnh báo nội dung: {warnings.map(w => WARNING_LABEL[w] ?? w).join(' · ')}
  </Text>;
}

/** Lời nhắc khi truyện 18+ bị chặn (trang truyện + trang đọc). Server không gửi nội dung chương. */
export function Age18Notice({ reason, textColor = '#143b4d', mutedColor = '#8a8178', panelColor = '#eceae7' }: {
  reason: 'guest' | 'unverified' | 'underage';
  textColor?: string; mutedColor?: string; panelColor?: string;
}) {
  const body = reason === 'guest'
    ? 'Truyện này chỉ dành cho tài khoản đã xác thực đủ 18 tuổi qua CCCD. Vui lòng đăng nhập để tiếp tục.'
    : reason === 'unverified'
      ? 'Truyện này chỉ dành cho tài khoản đã xác thực đủ 18 tuổi. Xác thực CCCD trong Thông tin cá nhân để đọc.'
      : 'Năm sinh trên CCCD đã xác thực của bạn chưa đủ 18 tuổi. Nếu bạn vừa đủ 18 tuổi trong năm nay, hãy cập nhật đúng ngày sinh.';
  const cta = reason === 'guest'
    ? { label: 'Đăng nhập', go: () => router.push('/(tabs)/ca-nhan') }
    : { label: reason === 'unverified' ? 'Xác thực CCCD' : 'Cập nhật ngày sinh', go: () => router.push('/thong-tin-ca-nhan') };
  return <View style={{ backgroundColor: panelColor, borderRadius: 18, padding: 22, marginBottom: 24 }}>
    <Text accessibilityRole="header" style={{ color: textColor, fontSize: 20, fontWeight: '700', marginBottom: 12 }}>🔒 Nội dung 18+</Text>
    <Text style={{ color: mutedColor, lineHeight: 24, marginBottom: 16 }}>{body}</Text>
    <Pressable accessibilityRole="button" onPress={cta.go} style={{ minHeight: 48, borderRadius: 14, backgroundColor: '#143b4d',
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}>
      <Text style={{ color: '#fff', fontWeight: '700' }}>{cta.label}</Text>
    </Pressable>
  </View>;
}

const CONFIRM16_KEY = 'vinh.age16-confirmed';

/** Hỏi "Tôi đủ 16 tuổi" 1 lần cho truyện 16+ (chỉ tự xác nhận, không cần CCCD) — nhớ trên thiết bị. */
export function Age16Confirm({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    secureStorage.getItem(CONFIRM16_KEY).then(v => { if (alive && v !== '1') setOpen(true); })
      .catch(() => { if (alive) setOpen(true); });
    return () => { alive = false; };
  }, [active]);
  function confirm() {
    setOpen(false);
    void secureStorage.setItem(CONFIRM16_KEY, '1').catch(() => undefined);
  }
  function leave() {
    setOpen(false);
    if (router.canGoBack()) router.back(); else router.replace('/');
  }
  return <Modal visible={open} transparent animationType="fade" onRequestClose={leave}>
    <View style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 }}>
      <View style={{ backgroundColor: '#fbf7ec', borderRadius: 24, padding: 24 }}>
        <Text accessibilityRole="header" style={{ color: '#143b4d', fontSize: 20, fontWeight: '700', marginBottom: 10 }}>
          Truyện dành cho người đủ 16 tuổi</Text>
        <Text style={{ color: '#5c5650', lineHeight: 24, marginBottom: 20 }}>
          Truyện có thể chứa bạo lực, kinh dị hoặc chủ đề nặng. Bạn xác nhận mình đủ 16 tuổi để tiếp tục?</Text>
        <Pressable accessibilityRole="button" onPress={confirm} style={{ minHeight: 48, borderRadius: 14, backgroundColor: '#143b4d',
          alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Tôi đủ 16 tuổi</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={leave} style={{ minHeight: 48, borderRadius: 14, borderWidth: 1,
          borderColor: '#e2d9c8', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#143b4d', fontWeight: '700' }}>Quay lại</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}
