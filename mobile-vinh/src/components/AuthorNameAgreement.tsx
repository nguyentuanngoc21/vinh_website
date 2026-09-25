import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Check, Notice } from './Form';
import { getAuthorAgreement, orderAction, type AuthorAgreement } from '../services/orders';

// Verbatim from the web's author-name-agreement-panel.tsx — legal wording supplied by the project
// owner; do not rephrase here without changing the web copy too.
const LEGAL_POINTS = [
  'Đây là thỏa thuận thực tế giữa hai bên, không phải chuyển nhượng quyền đứng tên theo nghĩa pháp lý tuyệt đối — vì luật không cho phép chuyển nhượng quyền này.',
  'Người viết hộ vẫn giữ khả năng khẳng định lại quyền tác giả của mình sau này theo pháp luật, bất kể đã thỏa thuận với khách hàng.',
  'Nền tảng ghi nhận đây là thỏa thuận tự nguyện tại thời điểm xác nhận, không đảm bảo hiệu lực tuyệt đối trước pháp luật; khuyến nghị hai bên cân nhắc kỹ, đặc biệt với tác phẩm có khả năng phát sinh giá trị lớn sau này.',
];
const CHOICES: [AuthorAgreement['author_display_choice'], string][] = [
  ['customer_name', 'Khách hàng đứng tên tác giả duy nhất'], ['co_authorship', 'Đồng sáng tác — hiển thị cả 2 tên'],
];

/** "Đứng tên tác giả thay" for delivered/completed ghostwriting orders: one side starts, each side confirms its own statement. */
export function AuthorNameAgreement({ userId, orderId }: { userId: string; orderId: string }) {
  const [agreement, setAgreement] = useState<AuthorAgreement | null | undefined>(undefined);
  const [choice, setChoice] = useState<AuthorAgreement['author_display_choice']>('customer_name');
  const [ghostwriterVisible, setGhostwriterVisible] = useState(false);
  const [customerVisible, setCustomerVisible] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    getAuthorAgreement(userId, orderId).then(a => { if (active) setAgreement(a); })
      .catch(e => { if (active) { setAgreement(null); setError(e instanceof Error ? e.message : 'Không tải được thỏa thuận.'); } });
    return () => { active = false; };
  }, [userId, orderId]);
  if (agreement === undefined) return null;

  async function run(task: () => Promise<{ agreement?: AuthorAgreement }>) {
    if (busy) return;
    setBusy(true); setError('');
    try { const result = await task(); if (result.agreement) setAgreement(result.agreement); }
    catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }
  const isGhostwriter = agreement?.ghostwriter_id === userId;
  const myPending = agreement && (isGhostwriter ? !agreement.ghostwriter_confirmed_at : agreement.customer_id === userId && !agreement.customer_confirmed_at);
  const both = agreement?.ghostwriter_confirmed_at && agreement?.customer_confirmed_at;
  const myStatement = agreement && (isGhostwriter ? agreement.ghostwriter_statement_text : agreement.customer_statement_text);

  return <View className="mt-5 rounded-2xl border border-cream-border bg-white p-4">
    <Text className="mb-2 text-lg font-bold text-brand-ink">Đứng tên tác giả thay</Text>
    {!agreement && <>
      <View className="rounded-xl border border-brand-gold bg-cream-card p-3">
        <Text className="mb-2 font-bold text-brand-ink">Trước khi xác nhận, cả hai bên cần hiểu rõ:</Text>
        {LEGAL_POINTS.map((point, i) => <Text key={i} className="mb-2 leading-6 text-brand-ink">{i + 1}. {point}</Text>)}
      </View>
      {CHOICES.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: choice === value }}
        onPress={() => setChoice(value)} className={`mt-3 min-h-12 justify-center rounded-xl border px-4 ${choice === value ? 'border-brand-ink bg-cream' : 'border-cream-border bg-white'}`}>
        <Text className="text-brand-ink">{choice === value ? '● ' : '○ '}{label}</Text></Pressable>)}
      <Check checked={ghostwriterVisible} onToggle={() => setGhostwriterVisible(v => !v)}>
        <Text className="leading-6 text-brand-ink">Hiển thị tác phẩm này trong danh sách sample của tôi (người viết hộ)</Text></Check>
      <Check checked={customerVisible} onToggle={() => setCustomerVisible(v => !v)}>
        <Text className="leading-6 text-brand-ink">Hiển thị tác phẩm này ở hồ sơ khách hàng</Text></Check>
      <Check checked={acknowledged} onToggle={() => setAcknowledged(v => !v)}>
        <Text className="leading-6 text-brand-ink">Tôi đã đọc và hiểu hệ quả pháp lý ở trên</Text></Check>
      <Button label="Bắt đầu thỏa thuận" disabled={busy || !acknowledged} onPress={() => void run(() => orderAction(userId, orderId, 'start-author-agreement',
        { choice, ghostwriterSampleVisible: ghostwriterVisible, customerProfileVisible: customerVisible }))} />
    </>}
    {agreement && !both && (myPending ? <>
      {!!myStatement && <Text selectable className="rounded-xl border border-cream-border bg-cream-card p-3 leading-6 text-brand-ink">{myStatement}</Text>}
      <Button label="Tôi đồng ý" disabled={busy} onPress={() => void run(() => orderAction(userId, orderId, 'confirm-author-agreement',
        { agreementId: agreement.id }))} />
    </> : <Text className="leading-6 text-stone">Đang chờ bên còn lại xác nhận.</Text>)}
    {both && <Text className="font-bold text-brand-ink">
      Đã hoàn tất — {agreement?.author_display_choice === 'customer_name' ? 'khách hàng đứng tên tác giả' : 'cả 2 cùng đứng tên đồng tác giả'}.</Text>}
    <Notice message={error} />
  </View>;
}
