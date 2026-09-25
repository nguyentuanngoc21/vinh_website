import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Button, Notice } from './Form';
import {
  DISPUTE_REASONS, formatDateTime, getCancelPreview, getLostContact, orderAction, partyName,
  type CancelRequest, type LostContactStatus, type Order, type OrderAction, type RefundPreview,
} from '../services/orders';

const xu = (n: number) => `${n.toLocaleString('vi-VN')} xu`;
const input = 'rounded-xl border border-cream-border bg-white px-4 py-3 text-base text-brand-ink';

/** Cancel (both parties must agree), lost-contact reminder/report and disputes — same rules as the web card. */
export function OrderIssues({ userId, order, cancelRequest, onChanged }: {
  userId: string; order: Order; cancelRequest: CancelRequest | null; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [lostContact, setLostContact] = useState<LostContactStatus | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const isOpen = !['completed', 'cancelled', 'disputed'].includes(order.status);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    getLostContact(userId, order.id).then(s => { if (active) setLostContact(s); }).catch(() => undefined);
    return () => { active = false; };
  }, [isOpen, userId, order.id]);
  if (!isOpen) return null;

  async function run(task: () => Promise<unknown>, success: string, refresh = true) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await task(); setNotice(success); if (refresh) onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }
  const act = (action: OrderAction, fields: Record<string, unknown>, success: string) => run(() => orderAction(userId, order.id, action, fields), success);
  const ask = (title: string, message: string, yes: string, onYes: () => void) =>
    Alert.alert(title, message, [{ text: 'Không', style: 'cancel' }, { text: yes, style: 'destructive', onPress: onYes }]);

  return <View className="mt-5 rounded-2xl border border-cream-border bg-white p-4">
    <Text className="mb-3 text-lg font-bold text-brand-ink">Vấn đề với đơn hàng</Text>

    {/* Cancel: one side asks with a server-computed refund, the other side agrees or declines. */}
    {cancelRequest ? cancelRequest.requested_by === userId
      ? <Text className="leading-6 text-stone">Đang chờ {partyName(order)} đồng ý hủy đơn — người đặt được hoàn {xu(cancelRequest.refund_amount)} nếu đồng ý.</Text>
      : <View>
        <Text className="font-bold text-red-700">{partyName(order)} yêu cầu hủy đơn</Text>
        <Text className="mt-1 leading-6 text-stone">Người đặt được hoàn {xu(cancelRequest.refund_amount)} nếu bạn đồng ý.</Text>
        <Button label="Đồng ý hủy đơn" disabled={busy} onPress={() => ask('Đồng ý hủy đơn?',
          `Đơn bị hủy và người đặt được hoàn ${xu(cancelRequest.refund_amount)}. Không hoàn tác được.`, 'Hủy đơn',
          () => void act('resolve-cancel', { requestId: cancelRequest.id, agree: true }, 'Đã hủy đơn.'))} />
        <Button label="Từ chối" secondary disabled={busy} onPress={() => void act('resolve-cancel', { requestId: cancelRequest.id, agree: false }, 'Đã từ chối yêu cầu hủy.')} />
      </View>
      : preview ? <View>
        <Text className="leading-6 text-brand-ink">Nếu hủy: người đặt được hoàn {xu(preview.refund_amount)} ({preview.pct}%)
          {preview.used_platform_minimum ? ' — áp dụng mức sàn của Vịnh vì dịch vụ chưa tự khai chính sách hủy/hoàn tiền' : ''}.</Text>
        <Text className="mt-1 text-sm leading-5 text-stone">Đơn chỉ bị hủy khi {partyName(order)} đồng ý.</Text>
        <Button label="Gửi yêu cầu hủy" disabled={busy} onPress={() => void run(async () => {
          await orderAction(userId, order.id, 'request-cancel'); setPreview(null);
        }, 'Đã gửi yêu cầu hủy.')} />
        <Button label="Bỏ qua" secondary disabled={busy} onPress={() => setPreview(null)} />
      </View>
        : <Button label="Yêu cầu hủy đơn" secondary disabled={busy}
          onPress={() => void run(async () => setPreview(await getCancelPreview(userId, order.id)), '', false)} />}

    {/* Lost contact: remind first; reporting unlocks 7 days after the first reminder with 72h of silence. */}
    <Text className="mb-1 mt-6 font-bold text-brand-ink">Không liên lạc được?</Text>
    <Text className="leading-6 text-stone">Nhắc {partyName(order)} trước. Báo cáo mất liên lạc mở sau ít nhất 7 ngày kể từ lần nhắc đầu và
      không ai nhắn thêm trong 72 giờ.</Text>
    {lostContact?.firstReminderAt && <Text className="mt-1 text-sm text-stone">Nhắc lần đầu: {formatDateTime(lostContact.firstReminderAt)}</Text>}
    <Button label="Nhắc phản hồi" secondary disabled={busy} onPress={() => void run(async () => {
      await orderAction(userId, order.id, 'send-reminder');
      setLostContact(s => s && (s.firstReminderAt ? s : { ...s, firstReminderAt: new Date().toISOString() }));
    }, `Đã gửi nhắc nhở tới ${partyName(order)}.`, false)} />
    <Button label="Báo cáo mất liên lạc" secondary disabled={busy || !lostContact?.eligible} onPress={() => ask('Báo cáo mất liên lạc?',
      'Vịnh sẽ xem xét đơn này.', 'Báo cáo', () => void act('report-lost-contact', {}, 'Đã gửi báo cáo mất liên lạc.'))} />

    {/* Dispute: freezes the order for review by Vịnh. */}
    <Text className="mb-1 mt-6 font-bold text-brand-ink">Tranh chấp</Text>
    {!disputing ? <Button label="Mở tranh chấp" secondary disabled={busy} onPress={() => setDisputing(true)} /> : <View>
      <Text className="mb-2 leading-6 text-stone">Đơn sẽ tạm khóa mọi thao tác trong lúc Vịnh xem xét.</Text>
      {DISPUTE_REASONS.map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: reason === value }}
        onPress={() => setReason(value)} className={`mb-2 min-h-12 justify-center rounded-xl border px-4 ${reason === value ? 'border-brand-ink bg-cream' : 'border-cream-border bg-white'}`}>
        <Text className="text-brand-ink">{reason === value ? '● ' : '○ '}{label}</Text></Pressable>)}
      <TextInput accessibilityLabel="Mô tả tranh chấp" value={description} onChangeText={setDescription} editable={!busy} multiline textAlignVertical="top"
        placeholder="Mô tả chi tiết…" placeholderTextColor="#8a8178" className={input} style={{ minHeight: 100 }} />
      <Button label="Gửi tranh chấp" disabled={busy || !reason || !description.trim()} onPress={() => ask('Mở tranh chấp?',
        'Đơn chuyển sang Đang tranh chấp và tạm khóa cho tới khi Vịnh xử lý.', 'Gửi',
        () => void act('open-dispute', { reasonCategory: reason, description: description.trim() }, 'Đã mở tranh chấp.'))} />
      <Button label="Bỏ qua" secondary disabled={busy} onPress={() => setDisputing(false)} />
    </View>}
    <Notice message={error} />
    <Notice message={notice} tone="success" />
  </View>;
}
