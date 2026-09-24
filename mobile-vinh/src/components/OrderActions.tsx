import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { Button, Notice } from './Form';
import {
  deliverWithFile, getOriginalFileUrl, getSellerBooks, orderAction, SCOPE_LABELS,
  type FileRequest, type Order, type OrderAction,
} from '../services/orders';

const FILE_TYPES: Record<string, string[]> = { illustration: ['image/jpeg', 'image/png', 'image/webp'], voice: ['audio/mpeg', 'audio/wav'] };

function confirm(title: string, message: string, onYes: () => void, yes = 'Đồng ý') {
  Alert.alert(title, message, [{ text: 'Hủy', style: 'cancel' }, { text: yes, onPress: onYes }]);
}
const input = 'rounded-xl border border-cream-border bg-white px-4 py-3 text-base text-brand-ink';

/**
 * Actions valid for this viewer and status — the same conditions as the web's order-card.tsx.
 * The server (web routes + RPCs) remains the real check; errors from it are shown as-is.
 */
export function OrderActions({ userId, order, fileRequest, onChanged }: {
  userId: string; order: Order; fileRequest: FileRequest | null; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [scopeNote, setScopeNote] = useState(order.scope_note ?? '');
  const [brief, setBrief] = useState(order.brief);
  const [revisionNote, setRevisionNote] = useState('');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [books, setBooks] = useState<{ id: string; title: string }[] | null>(null);
  const [bookId, setBookId] = useState('');
  const isBuyer = order.role === 'buyer';
  const isSeller = order.role === 'seller';
  const serviceType = order.service_listings?.service_type ?? '';
  const needsFile = serviceType === 'illustration' || serviceType === 'voice';
  const isOpen = !['completed', 'cancelled', 'disputed'].includes(order.status);
  const needsBook = serviceType === 'ghostwriting' && isSeller && !order.book_id && isOpen;

  useEffect(() => {
    if (!needsBook) return;
    let active = true;
    getSellerBooks(userId, order.id).then(list => { if (active) setBooks(list); }).catch(() => { if (active) setBooks([]); });
    return () => { active = false; };
  }, [needsBook, userId, order.id]);

  async function run(task: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await task(); setNotice(success); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }
  const act = (action: OrderAction, fields: Record<string, unknown>, success: string) => run(() => orderAction(userId, order.id, action, fields), success);

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: FILE_TYPES[serviceType], multiple: false, copyToCacheDirectory: true });
    if (!result.canceled && result.assets[0]) setFile(result.assets[0]);
  }

  const blocks: React.ReactNode[] = [];
  // draft: buyer picks the usage scope first, then writes and locks the brief.
  if (order.status === 'draft' && isBuyer && !order.usage_scope) blocks.push(<View key="scope">
    <Text className="mb-2 font-bold text-brand-ink">Chọn phạm vi quyền sử dụng</Text>
    <TextInput accessibilityLabel="Mục đích sử dụng thương mại" value={scopeNote} onChangeText={setScopeNote} editable={!busy} multiline
      placeholder="Mô tả mục đích sử dụng thương mại (bắt buộc nếu chọn Thương mại giới hạn)" placeholderTextColor="#8a8178" className={input} />
    {Object.entries(SCOPE_LABELS).map(([value, label]) => <Button key={value} label={label} secondary disabled={busy || (value === 'commercial_limited' && !scopeNote.trim())}
      onPress={() => void act('set-scope', { usageScope: value, scopeNote: value === 'commercial_limited' ? scopeNote.trim() : null }, `Đã chọn phạm vi: ${label}.`)} />)}
  </View>);
  if (order.status === 'draft' && isBuyer && order.usage_scope) blocks.push(<View key="brief">
    <Text className="mb-2 font-bold text-brand-ink">Brief cho người thực hiện</Text>
    <TextInput accessibilityLabel="Nội dung brief" value={brief} onChangeText={setBrief} editable={!busy} multiline textAlignVertical="top"
      placeholder="Mô tả yêu cầu, tông màu, hạn mong muốn…" placeholderTextColor="#8a8178" className={input} style={{ minHeight: 120 }} />
    <Button label="Lưu nháp brief" secondary disabled={busy || brief === order.brief} onPress={() => void act('save-brief', { brief }, 'Đã lưu nháp brief.')} />
    <Button label="Chốt brief" disabled={busy || !brief.trim()} onPress={() => confirm('Chốt brief?', 'Sau khi chốt, brief không sửa được nữa và đơn chuyển sang bước đặt cọc.', () => void run(async () => {
      if (brief !== order.brief) await orderAction(userId, order.id, 'save-brief', { brief });
      await orderAction(userId, order.id, 'confirm-brief');
    }, 'Đã chốt brief.'), 'Chốt brief')} />
  </View>);
  if (order.status === 'draft' && isSeller) blocks.push(<Text key="wait-brief" className="leading-6 text-stone">Đang chờ khách chọn phạm vi sử dụng và chốt brief.</Text>);
  if (order.status === 'brief_confirmed' && isSeller) blocks.push(<Text key="wait-deposit" className="leading-6 text-stone">Đang chờ khách đặt cọc.</Text>);

  // in_progress, seller: attach the manuscript (ghostwriting), send drafts, deliver.
  if (needsBook) blocks.push(<View key="book">
    <Text className="mb-2 font-bold text-brand-ink">Gắn truyện vào đơn viết thuê</Text>
    <Text className="mb-2 leading-6 text-stone">Khách được quyền xem bản thảo của truyện đã gắn.</Text>
    {books === null ? <Text className="text-stone">Đang tải danh sách truyện…</Text>
      : !books.length ? <Text className="text-stone">Bạn chưa có truyện nào để gắn. Tạo truyện trên website trước.</Text>
        : books.map(b => <Pressable key={b.id} accessibilityRole="radio" accessibilityState={{ selected: bookId === b.id }} onPress={() => setBookId(b.id)}
          className={`mb-2 min-h-12 justify-center rounded-xl border px-4 ${bookId === b.id ? 'border-brand-ink bg-cream' : 'border-cream-border bg-white'}`}>
          <Text className="text-brand-ink">{bookId === b.id ? '● ' : '○ '}{b.title}</Text></Pressable>)}
    {!!books?.length && <Button label="Gắn truyện" disabled={busy || !bookId} onPress={() => void act('attach-book', { bookId }, 'Đã gắn truyện vào đơn.')} />}
  </View>);
  if (order.status === 'in_progress' && isSeller) blocks.push(<View key="work">
    <Button label="Gửi bản nháp" secondary disabled={busy} onPress={() => confirm('Gửi bản nháp?',
      'Đánh dấu đã gửi bản nháp mới để khách duyệt hoặc yêu cầu sửa. Hãy gửi nội dung bản nháp qua tin nhắn.',
      () => void act('submit-draft', {}, 'Đã gửi bản nháp.'), 'Gửi')} />
    {needsFile && <>
      <Text className="mb-1 mt-4 font-bold text-brand-ink">Bàn giao sản phẩm</Text>
      <Text className="mb-2 leading-6 text-stone">{serviceType === 'voice' ? 'Tệp MP3 hoặc WAV' : 'Ảnh JPG, PNG hoặc WEBP'}, tối đa 30 MB.
        {serviceType === 'illustration' ? ' Khách chỉ thấy bản có watermark cho tới khi hai bên đồng ý mở tệp gốc.' : ''}</Text>
      <Button label={file ? `Đã chọn: ${file.name}` : 'Chọn tệp bàn giao'} secondary disabled={busy} onPress={() => void pickFile()} />
    </>}
    <Button label={busy ? 'Đang xử lý…' : 'Đánh dấu đã bàn giao'} disabled={busy || (needsFile && !file)} onPress={() => confirm('Bàn giao sản phẩm?',
      'Đơn chuyển sang Đã bàn giao. Nếu khách không phản hồi, hệ thống tự xác nhận sau 7 ngày.',
      () => void run(() => needsFile && file
        ? deliverWithFile(userId, order.id, { uri: file.uri, name: file.name, mimeType: file.mimeType ?? '', size: file.size })
        : orderAction(userId, order.id, 'deliver'), 'Đã bàn giao sản phẩm.'), 'Bàn giao')} />
  </View>);

  // in_progress, buyer: review the latest draft.
  if (order.status === 'in_progress' && isBuyer && order.draft_number > order.drafts_approved) {
    const left = order.revisions_max - order.revisions_used;
    blocks.push(<View key="review">
      <Text className="mb-2 font-bold text-brand-ink">Bản nháp #{order.draft_number} · còn {left} lần sửa</Text>
      <Button label="Duyệt bản nháp" disabled={busy} onPress={() => void act('approve-draft', {}, 'Đã duyệt bản nháp.')} />
      {left > 0 && <>
        <TextInput accessibilityLabel="Nội dung cần sửa" value={revisionNote} onChangeText={setRevisionNote} editable={!busy} multiline
          placeholder="Cần sửa gì? (không bắt buộc)" placeholderTextColor="#8a8178" className={`${input} mt-4`} />
        <Button label="Yêu cầu sửa" secondary disabled={busy} onPress={() => confirm('Yêu cầu sửa?', `Dùng 1 trong ${left} lần sửa còn lại.`,
          () => void act('request-revision', { note: revisionNote.trim() || null }, 'Đã gửi yêu cầu sửa.'), 'Yêu cầu')} />
      </>}
    </View>);
  }

  if (order.status === 'delivered' && isBuyer) blocks.push(<Button key="confirm" label="Xác nhận đã nhận" disabled={busy}
    onPress={() => confirm('Xác nhận đã nhận?', 'Đơn hoàn tất và tiền được chuyển cho người thực hiện. Không hoàn tác được.',
      () => void act('confirm-received', {}, 'Đã xác nhận nhận hàng.'), 'Xác nhận')} />);

  // Original (unwatermarked) file: one side asks, the other agrees.
  if ((order.status === 'delivered' || order.status === 'completed') && needsFile) blocks.push(<View key="original" className="mt-2">
    <Text className="mb-1 font-bold text-brand-ink">Tệp gốc (không watermark)</Text>
    {!fileRequest || fileRequest.status === 'declined' ? <>
      {fileRequest?.status === 'declined' && <Text className="mb-1 text-stone">Yêu cầu trước đã bị từ chối.</Text>}
      <Button label="Yêu cầu tệp gốc" secondary disabled={busy} onPress={() => void act('request-original', {}, 'Đã gửi yêu cầu tệp gốc.')} />
    </> : fileRequest.status === 'pending' ? fileRequest.requested_by === userId
      ? <Text className="leading-6 text-stone">Đang chờ bên kia đồng ý mở tệp gốc.</Text>
      : <>
        <Text className="leading-6 text-stone">Bên kia yêu cầu mở tệp gốc.</Text>
        <Button label="Đồng ý" disabled={busy} onPress={() => void act('resolve-original', { requestId: fileRequest.id, agree: true }, 'Đã đồng ý mở tệp gốc.')} />
        <Button label="Từ chối" secondary disabled={busy} onPress={() => void act('resolve-original', { requestId: fileRequest.id, agree: false }, 'Đã từ chối.')} />
      </>
      : <Button label="Tải tệp gốc" secondary disabled={busy}
        onPress={() => void run(async () => WebBrowser.openBrowserAsync(await getOriginalFileUrl(userId, order.id)), '')} />}
  </View>);

  if (order.status === 'disputed') blocks.push(<Text key="disputed" className="leading-6 text-red-700">Đơn đang được Vịnh xem xét tranh chấp — thao tác tạm khóa.</Text>);
  if (!blocks.length && !error && !notice) return null;
  return <View className="mt-5 rounded-2xl border border-cream-border bg-white p-4">
    <Text className="mb-3 text-lg font-bold text-brand-ink">Việc cần làm</Text>
    {blocks}
    <Notice message={error} />
    <Notice message={notice} tone="success" />
  </View>;
}
